import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { isLocalDevAccess } from "@/lib/auth/local-dev"
import { getOwnerSession } from "@/lib/auth/ownerSession"

export async function requireOwnerApi() {
  const hostname = (await headers()).get("host")?.split(":")[0] || ""
  if (isLocalDevAccess(hostname)) return null

  if (!(await getOwnerSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  }
  return null
}
