export function isLocalDevAccess(
  hostname: string,
  environment = process.env.NODE_ENV,
  enabled = process.env.COMPANY_LOCAL_DEV_ACCESS
) {
  return environment === "development" && enabled === "1" && hostname === "127.0.0.1"
}
