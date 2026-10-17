import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

function isAllowedGitHubProfile(profile: unknown) {
  const allowedUserId = process.env.AUTOLISTY_GITHUB_USER_ID?.trim()
  if (!allowedUserId || !profile || typeof profile !== "object") return false

  const githubId = "id" in profile ? String(profile.id) : ""
  return githubId === allowedUserId
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: {
        params: { scope: "read:user" },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async signIn({ account, profile }) {
      return account?.provider === "github" && isAllowedGitHubProfile(profile)
    },
    async jwt({ token, profile }) {
      if (profile && "id" in profile) token.githubId = String(profile.id)
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user.githubId = String(token.githubId || "")
      return session
    },
  },
})
