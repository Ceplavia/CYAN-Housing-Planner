import { libraryBackup } from '$lib/server/userLibrary';

export function GET({ locals }) {
  return new Response(libraryBackup(locals.user!.id), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="cyan-housing-planner-library-backup.json"',
      'Cache-Control': 'no-store',
    },
  });
}
