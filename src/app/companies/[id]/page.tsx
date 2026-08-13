import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import CompanyDetail from "@/components/library/CompanyDetail";
import { getCompany, getCompanyDecks } from "@/lib/data/companies";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const company = await getCompany(id);
  if (!company) notFound();

  const decks = await getCompanyDecks(id);

  return (
    <main className="app-shell app-shell-wide">
      <AppHeader />
      <CompanyDetail company={company} decks={decks} />
    </main>
  );
}
