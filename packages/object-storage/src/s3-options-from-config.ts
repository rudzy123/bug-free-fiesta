/**
 * Shared S3 option mapping for API/worker composition roots.
 * Call only after `@esign/config` validated the environment.
 */
export function s3OptionsFromConfig(config: {
  readonly OBJECT_STORAGE_ENDPOINT?: string | undefined;
  readonly OBJECT_STORAGE_REGION?: string | undefined;
  readonly OBJECT_STORAGE_BUCKET?: string | undefined;
  readonly OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
  readonly OBJECT_STORAGE_SECRET_KEY?: string | undefined;
  readonly OBJECT_STORAGE_FORCE_PATH_STYLE?: boolean | undefined;
}): {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
} {
  return {
    endpoint: config.OBJECT_STORAGE_ENDPOINT ?? '',
    region: config.OBJECT_STORAGE_REGION ?? '',
    bucket: config.OBJECT_STORAGE_BUCKET ?? '',
    accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY ?? '',
    secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY ?? '',
    forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE ?? true,
  };
}
