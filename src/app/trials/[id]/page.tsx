import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnerId } from "@/lib/session";
import { getTrial } from "@/lib/service";
import { getScript } from "@/lib/pressure-scripts";
import { TrialDetail } from "@/components/trial-detail";
import { Legend } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  await getOwnerId();
  try {
    const trial = await getTrial(id);
    return {
      title: `${trial.subject} — hold grade ${trial.result.grade.toFixed(1)}`,
      description: trial.result.summary,
      alternates: { canonical: `/trials/${trial.id}` },
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Trial not found", robots: { index: false, follow: false } };
  }
}

export default async function TrialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getOwnerId();

  let trial;
  try {
    trial = await getTrial(id);
  } catch {
    notFound();
  }

  const script = getScript(trial.scriptId);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link href="/estate" className="text-xs text-ink-soft hover:text-ink hover:underline">
          &larr; Estate
        </Link>
      </nav>

      <header className="mb-6">
        <Legend>
          {script?.title ?? trial.scriptId} v{trial.scriptVersion} · {trial.serviceLoad.toFixed(2)}&times;
          service load
        </Legend>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{trial.subject}</h1>
      </header>

      <TrialDetail initial={trial} />
    </div>
  );
}