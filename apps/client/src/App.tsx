import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/home/Index";
import ServicesPage from "./pages/services/Index";
import AgendaPage from "./pages/agenda/Index";
import ContactPage from "./pages/contact/Index";
import NotFound from "./pages/not-found/Index";
import AdminPage from "./pages/admin/Index";
import AuthPage from "./pages/auth/Index";
import ResetPasswordPage from "./pages/reset-password/Index";
import MyBookingsPage from "./pages/my-bookings/Index";
import MyRewardsPage from "./pages/my-rewards/Index";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/servicos" element={<ServicesPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/contato" element={<ContactPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/minhas-reservas" element={<MyBookingsPage />} />
          <Route path="/meus-bonus" element={<MyRewardsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
