import { Injectable, Optional } from '@ts-stack/di';

import { Fn, TreeConfig, RouteType, RouteParam } from './types';

@Injectable()
export class Tree {
  type: RouteType;
  children: this[];
  protected path: string;
  protected wildChild: boolean;
  protected handle: Fn;
  protected indices: string;
  protected priority: number;

  constructor(@Optional() treeConfig?: TreeConfig) {
    Object.assign(this, new TreeConfig(), treeConfig);
  }

  /**
   * Adds a node with the given handle to the path.
   */
  addRoute(path: string, handle: Fn) {
    this.priority++;
    const numParams = this.countParams(path);

    if (this.path.length || this.children.length) {
      // Non-empty tree
      this.mergeTree(this, path, path, numParams, handle);
    } else {
      // Empty tree
      this.insertChild(numParams, path, path, handle);
      this.type = RouteType.root;
    }
  }

  protected mergeTree(tree: this, fullPath: string, path: string, numParams: number, handle: Fn) {
    // Find the longest common prefix
    // This also implies that the common prefix contains no ':' or '*'
    // since the existing key can't contain those chars.
    let i = 0;
    const min = Math.min(path.length, tree.path.length);
    while (i < min && path[i] == tree.path[i]) {
      i++;
    }

    if (i < tree.path.length) {
      this.splitAdge(tree, path, i);
    }

    // Make new node a child of this node
    if (i < path.length) {
      const newPath = path.slice(i);

      if (tree.wildChild) {
        this.checkWildcardMatches(tree.children[0], numParams, newPath, fullPath, handle);
        return;
      }

      const firstChar = newPath[0];

      // Slash after param
      if (tree.type == RouteType.param && firstChar == '/' && tree.children.length == 1) {
        const child = tree.children[0];
        child.priority++;
        this.mergeTree(child, fullPath, newPath, numParams, handle);
        return;
      }

      // Check if a child with the next path char exists
      for (let j = 0; j < tree.indices.length; j++) {
        if (firstChar == tree.indices[j]) {
          j = tree.addPriority(j);
          this.mergeTree(tree.children[j], fullPath, newPath, numParams, handle);
          return;
        }
      }

      // Otherwise insert it
      if (firstChar != ':' && firstChar != '*') {
        tree.indices += firstChar;
        const treeConfig: TreeConfig = { path: '', wildChild: false, type: RouteType.static };
        const child = this.newTree(treeConfig);
        tree.children.push(child);
        tree.addPriority(tree.indices.length - 1);
        child.insertChild(numParams, newPath, fullPath, handle);
      } else {
        tree.insertChild(numParams, newPath, fullPath, handle);
      }
    } else if (i == path.length) {
      // Make node a (in-path leaf)
      if (tree.handle !== null) {
        throw new Error(`A handle is already registered for path '${fullPath}'`);
      }
      tree.handle = handle;
    }
  }

  protected checkWildcardMatches(
    tree: this,
    numParams: number,
    path: string,
    fullPath: string,
    handle: Fn
  ) {
    tree.priority++;
    numParams--;

    // Check if the wildcard matches
    if (
      path.length >= tree.path.length &&
      tree.path == path.slice(0, tree.path.length) &&
      (tree.path.length >= path.length || path[tree.path.length] == '/')
    ) {
      this.mergeTree(tree, fullPath, path, numParams, handle);
    } else {
      this.throwWildcardConflict(tree, path, fullPath);
    }
  }

  protected throwWildcardConflict(tree: this, path: string, fullPath: string) {
    let pathSeg = '';
    if (tree.type == RouteType.catchAll) {
      pathSeg = path;
    } else {
      pathSeg = path.split('/')[0];
    }
    const prefix = fullPath.slice(0, fullPath.indexOf(pathSeg)) + tree.path;
    throw new Error(
      `'${pathSeg}' in new path '${fullPath}' conflicts with existing wildcard '${tree.path}' in existing prefix '${prefix}'`
    );
  }

  protected splitAdge(tree: this, path: string, i: number) {
    const treeConfig: TreeConfig = {
      path: tree.path.slice(i),
      wildChild: tree.wildChild,
      type: RouteType.static,
      indices: tree.indices,
      children: tree.children,
      handle: tree.handle,
      priority: tree.priority - 1,
    };

    const child = this.newTree(treeConfig);

    tree.children = [child];
    tree.indices = tree.path[i];
    tree.path = path.slice(0, i);
    tree.handle = null;
    tree.wildChild = false;
  }

  search(path: string) {
    let handle = null;
    const params: RouteParam[] = [];
    let tree: this = this;

    walk: while (true) {
      if (path.length > tree.path.length) {
        if (path.slice(0, tree.path.length) == tree.path) {
          path = path.slice(tree.path.length);
          // If this node does not have a wildcard child,
          // we can just look up the next child node and continue
          // to walk down the tree
          if (!tree.wildChild) {
            const c = path.charCodeAt(0);
            for (let i = 0; i < tree.indices.length; i++) {
              if (c == tree.indices.charCodeAt(i)) {
                tree = tree.children[i];
                continue walk;
              }
            }

            // Nothing found.
            return { handle, params };
          }

          // Handle wildcard child
          tree = tree.children[0];
          switch (tree.type) {
            case RouteType.param:
              // Find param end
              let end = 0;
              while (end < path.length && path.charCodeAt(end) != 47) {
                end++;
              }

              // Save param value
              params.push({ key: tree.path.slice(1), value: path.slice(0, end) });

              // We need to go deeper!
              if (end < path.length) {
                if (tree.children.length > 0) {
                  path = path.slice(end);
                  tree = tree.children[0];
                  continue walk;
                }

                // ... but we can't
                return { handle, params };
              }

              handle = tree.handle;

              return { handle, params };

            case RouteType.catchAll:
              params.push({ key: tree.path.slice(2), value: path });

              handle = tree.handle;
              return { handle, params };

            default:
              throw new Error('invalid node type');
          }
        }
      } else if (path == tree.path) {
        handle = tree.handle;
      }

      return { handle, params };
    }
  }

  protected newTree(treeConfig?: TreeConfig) {
    return new (this.constructor as typeof Tree)(treeConfig) as this;
  }

  protected countParams(path: string) {
    let n = 0;
    for (const char of path) {
      if (char != ':' && char != '*') {
        continue;
      }
      n++;
    }

    return n;
  }

  protected addPriority(pos: number) {
    const children = this.children;
    children[pos].priority++;
    const prio = children[pos].priority;

    // Adjust position (move to fron)
    let newPos = pos;
    while (newPos > 0 && children[newPos - 1].priority < prio) {
      const temp = children[newPos];
      children[newPos] = children[newPos - 1];
      children[newPos - 1] = temp;
      newPos--;
    }

    // Build new index char string
    if (newPos != pos) {
      this.indices =
        this.indices.slice(0, newPos) +
        this.indices[pos] +
        this.indices.slice(newPos, pos) +
        this.indices.slice(pos + 1);
    }

    return newPos;
  }

  protected insertChild(numParams: number, path: string, fullPath: string, handle: Fn) {
    let tree: this = this;
    let offset = 0; // Already handled chars of the path

    // Find prefix until first wildcard
    for (let i = 0, max = path.length; numParams > 0; i++) {
      const c = path[i];
      if (c != ':' && c != '*') {
        continue;
      }

      // Find wildcard end (either '/' or path end)
      let end = i + 1;
      while (end < max && path[end] != '/') {
        if (path[end] == ':' || path[end] == '*') {
          throw new Error(
            `only one wildcard per path segment is allowed, has: '${path.slice(
              i
            )}' in path '${fullPath}'`
          );
        } else {
          end++;
        }
      }

      // Check if this Tree existing children which would be unreachable
      // if we insert the wildcard here
      if (tree.children.length > 0) {
        throw new Error(
          `wildcard route '${path.slice(
            i,
            end
          )}' conflicts with existing children in path '${fullPath}'`
        );
      }

      // check if the wildcard has a name
      if (end - i < 2) {
        throw new Error(`wildcards must be named with a non-empty name in path '${fullPath}'`);
      }

      if (c == ':') {
        // Split path at the beginning of the wildcard
        if (i > 0) {
          tree.path = path.slice(offset, i);
          offset = i;
        }

        const treeConfig1: TreeConfig = { path: '', wildChild: false, type: RouteType.param };
        const child = this.newTree(treeConfig1);
        tree.children = [child];
        tree.wildChild = true;
        tree = child;
        tree.priority++;
        numParams--;
        if (end < max) {
          tree.path = path.slice(offset, end);
          offset = end;

          const treeConfig2: TreeConfig = {
            path: '',
            wildChild: false,
            type: RouteType.static,
            indices: '',
            children: [],
            handle: null,
            priority: 1,
          };
          const staticChild = this.newTree(treeConfig2);
          tree.children = [staticChild];
          tree = staticChild;
        }
      } else {
        if (end != max || numParams > 1) {
          throw new Error(
            `catch-all routes are only allowed at the end of the path in path '${fullPath}'`
          );
        }

        if (tree.path.length > 0 && tree.path[tree.path.length - 1] == '/') {
          throw new Error(
            `catch-all conflicts with existing handle for the path segment root in path '${fullPath}'`
          );
        }

        i--;
        if (path[i] != '/') {
          throw new Error(`no / before catch-all in path '${fullPath}'`);
        }

        tree.path = path.slice(offset, i);

        const treeConfig1: TreeConfig = { path: '', wildChild: true, type: RouteType.catchAll };

        // first node: catchAll node with empty path
        const catchAllChild = this.newTree(treeConfig1);
        tree.children = [catchAllChild];
        tree.indices = path[i];
        tree = catchAllChild;
        tree.priority++;

        const treeConfig2: TreeConfig = {
          path: path.slice(i),
          wildChild: false,
          type: RouteType.catchAll,
          indices: '',
          children: [],
          handle,
          priority: 1,
        };

        // second node: node holding the variable
        const child = this.newTree(treeConfig2);
        tree.children = [child];

        return;
      }
    }

    // insert remaining path part and handle to the leaf
    tree.path = path.slice(offset);
    tree.handle = handle;
  }
}
