import AppHeader from "@/components/AppHeader";
import CompanyLibrary from "@/components/library/CompanyLibrary";
import { getCompanies } from "@/lib/data/companies";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await getCompanies();

  return (
    <main className="app-shell">
      <AppHeader />
      <CompanyLibrary items={companies} />
    </main>
  );
}
