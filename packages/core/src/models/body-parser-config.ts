import { HttpMethod } from '../types/http-method';
import { MultipartBodyParserOptions } from '../types/multipart-body-parser-options';

export class BodyParserConfig {
  acceptMethods: HttpMethod[] = ['POST', 'PUT', 'PATCH'];
  maxBodySize: number = 1024 * 1024 * 5; // 5 MB
  multipartOpts: MultipartBodyParserOptions = {};
}
