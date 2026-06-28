import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCronExemptPath } from "@shared/lib/cronRoutes";

// Routes that don't require auth. `/f` = the public tokenized form-fill portal
// (Forms P2); `/s` = the public tokenized client schedule portal (Scheduling
// S18). In both, the token is the capability, served by a service-role route.
const PUBLIC_ROUTES = ["/login", "/f", "/s"];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No Supabase env? Don't gate — keeps fork-and-run / local dev viable.
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((p) => path === p || path.startsWith(`${p}/`));
  // Cron/M2M routes carry a CRON_SECRET bearer (no session) and enforce it
  // themselves — don't bounce them to /login (QBO-H11).
  const isCron = isCronExemptPath(path);

  if (!user && !isPublic && !isCron) {
    const loginUrl = new URL("/login", request.url);
    if (path !== "/") loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
