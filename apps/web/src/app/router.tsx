import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import { PortfoliosPage } from "../pages/PortfoliosPage";

export function AppRouter() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">🏹 Soul • Freeland</div>
        <nav>
          <NavLink to="/home">Home</NavLink>
          <NavLink to="/portfolios">Portfolios</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/portfolios" element={<PortfoliosPage />} />
      </Routes>
    </div>
  );
}
