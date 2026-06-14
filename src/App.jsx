import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Manutencao from './pages/Manutencao';
import Mapa from './pages/Mapa';
import Agendamentos from './pages/Agendamentos';
import Relatorios from './pages/Relatorios';
import CompletarPerfil from './pages/CompletarPerfil';
import Utilizadores from './pages/Utilizadores';
import Marcacoes from './pages/Marcacoes';
import ExportacaoMarcacoes from './pages/ExportacaoMarcacoes';
import Presenca from './pages/Presenca';
import ControloAcesso from './pages/ControloAcesso';
import GestaoHorarios from './pages/GestaoHorarios';
import GestaoAusencias from './pages/GestaoAusencias';
import RelatorioPresencaDiaria from './pages/RelatorioPresencaDiaria';
import RH from './pages/RH';
import FichaColaborador from './pages/FichaColaborador';
import GestaoContratos from './pages/GestaoContratos';
import GestaoFeriasRH from './pages/GestaoFeriasRH';
import HorasExtra from './pages/HorasExtra.jsx';
import BancoHoras from './pages/BancoHoras.jsx';
import MapaAssiduidade from './pages/MapaAssiduidade.jsx';
import Payroll from './pages/Payroll.jsx';
import Recibos from './pages/Recibos.jsx';
import ZonasAcesso from './pages/ZonasAcesso.jsx';
import Visitantes from './pages/Visitantes.jsx';
import RelatoriMovimentos from './pages/RelatoriMovimentos.jsx';
import DashboardRHExecutivo from './pages/DashboardRHExecutivo.jsx';
import RelatorioAbsentismo from './pages/RelatorioAbsentismo.jsx';
import AlertasCompliance from './pages/AlertasCompliance.jsx';
import JustificacaoFaltas from './pages/JustificacaoFaltas.jsx';
import GestAoBaixas from './pages/GestAoBaixas.jsx';
import GestaoDesempenho from './pages/GestaoDesempenho.jsx';
import GestaoFormacao from './pages/GestaoFormacao.jsx';
import DocumentosColaborador from './pages/DocumentosColaborador.jsx';
import FichaSalarial from './pages/FichaSalarial.jsx';
import CustosDepartamentos from './pages/CustosDepartamentos.jsx';
import Adiantamentos from './pages/Adiantamentos.jsx';
import Organigrama from './pages/Organigrama.jsx';
import ColaboradorPerfil from './pages/ColaboradorPerfil.jsx';
import AcessoHub from './pages/AcessoHub.jsx';
import DashboardExecutivo from './pages/DashboardExecutivo.jsx';
import DashboardTecnico from './pages/DashboardTecnico.jsx';
import AgentesLocais from './pages/AgentesLocais.jsx';
import Tenants from './pages/Tenants.jsx';
import Sites from './pages/Sites.jsx';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Manutencao" element={<LayoutWrapper currentPageName="Manutencao"><Manutencao /></LayoutWrapper>} />
      <Route path="/Relatorios" element={<LayoutWrapper currentPageName="Relatorios"><Relatorios /></LayoutWrapper>} />
      <Route path="/Agendamentos" element={<LayoutWrapper currentPageName="Agendamentos"><Agendamentos /></LayoutWrapper>} />
      <Route path="/CompletarPerfil" element={<LayoutWrapper currentPageName="CompletarPerfil"><CompletarPerfil /></LayoutWrapper>} />
      <Route path="/Mapa" element={<LayoutWrapper currentPageName="Mapa"><Mapa /></LayoutWrapper>} />
      <Route path="/Utilizadores" element={<LayoutWrapper currentPageName="Utilizadores"><Utilizadores /></LayoutWrapper>} />
      <Route path="/Marcacoes" element={<LayoutWrapper currentPageName="Marcacoes"><Marcacoes /></LayoutWrapper>} />
      <Route path="/ExportacaoMarcacoes" element={<LayoutWrapper currentPageName="ExportacaoMarcacoes"><ExportacaoMarcacoes /></LayoutWrapper>} />
      <Route path="/Presenca" element={<LayoutWrapper currentPageName="Presenca"><Presenca /></LayoutWrapper>} />
      <Route path="/ControloAcesso" element={<LayoutWrapper currentPageName="ControloAcesso"><ControloAcesso /></LayoutWrapper>} />
      <Route path="/GestaoHorarios" element={<LayoutWrapper currentPageName="GestaoHorarios"><GestaoHorarios /></LayoutWrapper>} />
      <Route path="/GestaoAusencias" element={<LayoutWrapper currentPageName="GestaoAusencias"><GestaoAusencias /></LayoutWrapper>} />
      <Route path="/RelatorioPresencaDiaria" element={<LayoutWrapper currentPageName="RelatorioPresencaDiaria"><RelatorioPresencaDiaria /></LayoutWrapper>} />
      <Route path="/RH" element={<LayoutWrapper currentPageName="RH"><RH /></LayoutWrapper>} />
      <Route path="/FichaColaborador" element={<LayoutWrapper currentPageName="FichaColaborador"><FichaColaborador /></LayoutWrapper>} />
      <Route path="/GestaoContratos" element={<LayoutWrapper currentPageName="GestaoContratos"><GestaoContratos /></LayoutWrapper>} />
      <Route path="/GestaoFeriasRH" element={<LayoutWrapper currentPageName="GestaoFeriasRH"><GestaoFeriasRH /></LayoutWrapper>} />
      <Route path="/HorasExtra" element={<LayoutWrapper currentPageName="HorasExtra"><HorasExtra /></LayoutWrapper>} />
      <Route path="/BancoHoras" element={<LayoutWrapper currentPageName="BancoHoras"><BancoHoras /></LayoutWrapper>} />
      <Route path="/MapaAssiduidade" element={<LayoutWrapper currentPageName="MapaAssiduidade"><MapaAssiduidade /></LayoutWrapper>} />
      <Route path="/Payroll" element={<LayoutWrapper currentPageName="Payroll"><Payroll /></LayoutWrapper>} />
      <Route path="/Recibos" element={<LayoutWrapper currentPageName="Recibos"><Recibos /></LayoutWrapper>} />
      <Route path="/ZonasAcesso" element={<LayoutWrapper currentPageName="ZonasAcesso"><ZonasAcesso /></LayoutWrapper>} />
      <Route path="/Visitantes" element={<LayoutWrapper currentPageName="Visitantes"><Visitantes /></LayoutWrapper>} />
      <Route path="/RelatorioMovimentos" element={<LayoutWrapper currentPageName="RelatorioMovimentos"><RelatoriMovimentos /></LayoutWrapper>} />
      <Route path="/DashboardRHExecutivo" element={<LayoutWrapper currentPageName="DashboardRHExecutivo"><DashboardRHExecutivo /></LayoutWrapper>} />
      <Route path="/RelatorioAbsentismo" element={<LayoutWrapper currentPageName="RelatorioAbsentismo"><RelatorioAbsentismo /></LayoutWrapper>} />
      <Route path="/AlertasCompliance" element={<LayoutWrapper currentPageName="AlertasCompliance"><AlertasCompliance /></LayoutWrapper>} />
      <Route path="/JustificacaoFaltas" element={<LayoutWrapper currentPageName="JustificacaoFaltas"><JustificacaoFaltas /></LayoutWrapper>} />
      <Route path="/GestAoBaixas" element={<LayoutWrapper currentPageName="GestAoBaixas"><GestAoBaixas /></LayoutWrapper>} />
      <Route path="/GestaoDesempenho" element={<LayoutWrapper currentPageName="GestaoDesempenho"><GestaoDesempenho /></LayoutWrapper>} />
      <Route path="/GestaoFormacao" element={<LayoutWrapper currentPageName="GestaoFormacao"><GestaoFormacao /></LayoutWrapper>} />
      <Route path="/DocumentosColaborador" element={<LayoutWrapper currentPageName="DocumentosColaborador"><DocumentosColaborador /></LayoutWrapper>} />
      <Route path="/FichaSalarial" element={<LayoutWrapper currentPageName="FichaSalarial"><FichaSalarial /></LayoutWrapper>} />
      <Route path="/CustosDepartamentos" element={<LayoutWrapper currentPageName="CustosDepartamentos"><CustosDepartamentos /></LayoutWrapper>} />
      <Route path="/Adiantamentos" element={<LayoutWrapper currentPageName="Adiantamentos"><Adiantamentos /></LayoutWrapper>} />
      <Route path="/Organigrama" element={<LayoutWrapper currentPageName="Organigrama"><Organigrama /></LayoutWrapper>} />
      <Route path="/ColaboradorPerfil" element={<LayoutWrapper currentPageName="ColaboradorPerfil"><ColaboradorPerfil /></LayoutWrapper>} />
      <Route path="/AcessoHub" element={<LayoutWrapper currentPageName="AcessoHub"><AcessoHub /></LayoutWrapper>} />
      <Route path="/DashboardExecutivo" element={<LayoutWrapper currentPageName="DashboardExecutivo"><DashboardExecutivo /></LayoutWrapper>} />
      <Route path="/DashboardTecnico" element={<LayoutWrapper currentPageName="DashboardTecnico"><DashboardTecnico /></LayoutWrapper>} />
      <Route path="/AgentesLocais" element={<LayoutWrapper currentPageName="AgentesLocais"><AgentesLocais /></LayoutWrapper>} />
      <Route path="/Tenants" element={<LayoutWrapper currentPageName="Tenants"><Tenants /></LayoutWrapper>} />
      <Route path="/Sites" element={<LayoutWrapper currentPageName="Sites"><Sites /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App