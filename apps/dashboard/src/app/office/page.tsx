import { OfficeBoard } from "@/features/office/OfficeBoard";

export const dynamic = "force-dynamic";

/** Office Berlin board as a page (the 3D room opens the same board as an overlay). */
export default function OfficePage() {
  return <OfficeBoard />;
}
