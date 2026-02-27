import BottomNav from "@/components/ui/BottomNav/BottomNav";

import Header from "@/components/ui/Header/Header";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header/>
      <main>{children}</main>
      <BottomNav />
    </>
  );
}
