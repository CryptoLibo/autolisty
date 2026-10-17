"use server"

import { signOut } from "@/auth"

export async function signOutOfAutolisty() {
  await signOut({ redirectTo: "/login" })
}
