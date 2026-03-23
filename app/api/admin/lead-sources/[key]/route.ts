import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataService } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await requireSession();
    const { key } = await params;
    const body = await request.json();

    // Deactivating a lead source requires admin role
    if (body.isActive === false && session.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can deactivate lead sources" },
        { status: 403 }
      );
    }

    const ds = await getDataService();
    const source = await ds.updateLeadSource(key, body);
    revalidatePath("/admin");
    return NextResponse.json(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
