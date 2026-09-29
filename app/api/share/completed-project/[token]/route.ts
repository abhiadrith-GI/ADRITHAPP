import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createAnonClient } from "@/lib/supabase/server";

// This route is the one place in the whole app that uses the Supabase
// service role key instead of the anon key + user session. Everywhere
// else, RLS is what enforces access - but generating a signed URL is a
// Storage API call, not a plain SQL SELECT, and RLS has no clean way to
// gate "does this anonymous request carry a valid share token" the way
// it can gate a table read. The token check below still happens first,
// through the same security-definer function used everywhere else in
// this feature (get_shared_completed_project_files) - the service role
// is only ever used AFTER that check passes, and only to sign URLs for
// exactly the files that specific token unlocks. It is never used to
// run an open-ended query built from anything the client sent directly.

// Real tokens are 43 URL-safe characters (older ones 32); anything else can
// be rejected without touching the database.
const TOKEN_FORMAT = /^[A-Za-z0-9_+-]{20,64}$/;

// Responses here contain short-lived signed file URLs - bearer credentials -
// so no shared cache or CDN may keep a copy.
const NO_STORE = { "Cache-Control": "no-store" };
const INVALID = { error: "This link is invalid or has been revoked." };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || !TOKEN_FORMAT.test(token)) {
    return NextResponse.json(INVALID, { status: 404, headers: NO_STORE });
  }

  const anonClient = await createAnonClient();
  const { data: files, error } = await anonClient.rpc("get_shared_completed_project_files", { share_token: token });

  if (error || !files || files.length === 0) {
    return NextResponse.json(INVALID, { status: 404, headers: NO_STORE });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "File sharing is not fully configured yet." }, { status: 503, headers: NO_STORE });
  }
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const folderName = files[0].folder_name;
  const withUrls = await Promise.all(
    files.map(async (f: { file_id: string; file_name: string; category: string; file_type: string; storage_path: string }) => {
      const { data: signed } = await serviceClient.storage.from("project-folder-files").createSignedUrl(f.storage_path, 600);
      return { id: f.file_id, fileName: f.file_name, category: f.category, fileType: f.file_type, url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ folderName, files: withUrls }, { headers: NO_STORE });
}
