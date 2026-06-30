const STATUS_CODE = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,

  OK: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInfo: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  IMUsed: 226,

  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,

  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  ContentTooLarge: 413,
  URITooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  Teapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,

  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HTTPVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
} as const;

const STATUS_TEXT = {
  202: "Accepted",
  208: "Already Reported",
  502: "Bad Gateway",
  400: "Bad Request",
  409: "Conflict",
  100: "Continue",
  201: "Created",
  103: "Early Hints",
  417: "Expectation Failed",
  424: "Failed Dependency",
  403: "Forbidden",
  302: "Found",
  504: "Gateway Timeout",
  410: "Gone",
  505: "HTTP Version Not Supported",
  226: "IM Used",
  507: "Insufficient Storage",
  500: "Internal Server Error",
  411: "Length Required",
  423: "Locked",
  508: "Loop Detected",
  405: "Method Not Allowed",
  421: "Misdirected Request",
  301: "Moved Permanently",
  207: "Multi Status",
  300: "Multiple Choices",
  511: "Network Authentication Required",
  204: "No Content",
  203: "Non Authoritative Info",
  406: "Not Acceptable",
  510: "Not Extended",
  404: "Not Found",
  501: "Not Implemented",
  304: "Not Modified",
  200: "OK",
  206: "Partial Content",
  402: "Payment Required",
  308: "Permanent Redirect",
  412: "Precondition Failed",
  428: "Precondition Required",
  102: "Processing",
  407: "Proxy Auth Required",
  413: "Content Too Large",
  431: "Request Header Fields Too Large",
  408: "Request Timeout",
  414: "URI Too Long",
  416: "Range Not Satisfiable",
  205: "Reset Content",
  303: "See Other",
  503: "Service Unavailable",
  101: "Switching Protocols",
  418: "I'm a teapot",
  307: "Temporary Redirect",
  425: "Too Early",
  429: "Too Many Requests",
  401: "Unauthorized",
  451: "Unavailable For Legal Reasons",
  422: "Unprocessable Entity",
  415: "Unsupported Media Type",
  426: "Upgrade Required",
  305: "Use Proxy",
  506: "Variant Also Negotiates",
} as const;

export type StatusCodeType = (typeof STATUS_CODE)[keyof typeof STATUS_CODE];
export type StatusTextType = (typeof STATUS_TEXT)[keyof typeof STATUS_TEXT];

export interface IHttpStatus {
  isInformational: (code: StatusCodeType) => boolean;
  isSuccessful: (code: StatusCodeType) => boolean;
  isRedirect: (code: StatusCodeType) => boolean;
  isClientError: (code: StatusCodeType) => boolean;
  isServerError: (code: StatusCodeType) => boolean;
  isError: (code: StatusCodeType) => boolean;
}

export class HttpStatus implements IHttpStatus {
  public static Code: typeof STATUS_CODE = STATUS_CODE;
  public static Text: typeof STATUS_TEXT = STATUS_TEXT;

  public isInformational: (code: StatusCodeType) => boolean = (code: StatusCodeType): boolean =>
    code >= STATUS_CODE.Continue && code < STATUS_CODE.OK;

  public isSuccessful: (code: StatusCodeType) => boolean = (code: StatusCodeType): boolean =>
    code >= STATUS_CODE.OK && code < STATUS_CODE.MultipleChoices;

  public isRedirect: (code: StatusCodeType) => boolean = (code: StatusCodeType): boolean =>
    code >= STATUS_CODE.MultipleChoices && code < STATUS_CODE.BadRequest;

  public isClientError: (code: StatusCodeType) => boolean = (code: StatusCodeType): boolean =>
    code >= STATUS_CODE.BadRequest && code < STATUS_CODE.InternalServerError;

  public isServerError: (code: StatusCodeType) => boolean = (code: StatusCodeType): boolean =>
    code >= STATUS_CODE.InternalServerError && code < 600;

  public isError: (code: StatusCodeType) => boolean = (code: StatusCodeType): boolean =>
    this.isClientError(code) || this.isServerError(code);
}
