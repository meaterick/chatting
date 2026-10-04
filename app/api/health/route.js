export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", commit: process.env.GIT_COMMIT || "local" });
}
