import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/auth"
import { isLocalDevAccess } from "@/lib/auth/local-dev"

export async function requireOwnerApi() {
  const hostname = (await headers()).get("host")?.split(":")[0] || ""
  if (isLocalDevAccess(hostname)) return null

  const session = await auth()
  const allowedUserId = process.env.AUTOLISTY_GITHUB_USER_ID?.trim()

  if (!allowedUserId || session?.user?.githubId !== allowedUserId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  }

  return null
}
