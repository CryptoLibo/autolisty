import "next-auth"

declare module "next-auth" {
  interface User {
    githubId?: string
  }

  interface Session {
    user?: {
      name?: string | null
      email?: string | null
      image?: string | null
      githubId?: string
    }
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    githubId?: string
  }
}
