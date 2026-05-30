import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import SystemHLD from "./pages/SystemHLD";
import SystemLLD from "./pages/SystemLLD";
import DSAPage from "./pages/DSAPage";
import LayersPage from "./pages/LayersPage";
import EncyclopediaPage from "./pages/EncyclopediaPage";
import MachineCodingPage from "./pages/MachineCodingPage";
import GoBasicsPage from "./pages/GoBasicsPage";
import { DSA_CATEGORIES } from "./data/dsa";
import { MC_CATEGORIES } from "./data/machineCoding";
import { GO_BASICS_CATEGORIES } from "./data/goBasics";
import "./styles/globals.css";

const firstCat = DSA_CATEGORIES[0];
const firstProblem = firstCat.problems[0];
const firstMC = MC_CATEGORIES[0];
const firstMCProblem = firstMC.problems[0];
const firstGB = GO_BASICS_CATEGORIES[0];
const firstGBTopic = firstGB.topics[0];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          {/* Layers of System Design */}
          <Route path="layers" element={<LayersPage />} />
          {/* SD Encyclopedia */}
          <Route path="encyclopedia" element={<EncyclopediaPage />} />
          {/* Generic routes — works for any systemId in the registry */}
          <Route path=":systemId/hld" element={<SystemHLD />} />
          <Route path=":systemId/lld" element={<SystemLLD />} />
          {/* DSA routes */}
          <Route
            path="dsa"
            element={<Navigate to={`/dsa/${firstCat.id}/${firstProblem.id}`} replace />}
          />
          <Route path="dsa/:categoryId/:problemId" element={<DSAPage />} />
          {/* Machine Coding routes */}
          <Route
            path="machine-coding"
            element={<Navigate to={`/machine-coding/${firstMC.id}/${firstMCProblem.id}`} replace />}
          />
          <Route path="machine-coding/:categoryId/:problemId" element={<MachineCodingPage />} />
          {/* Go Basics routes */}
          <Route
            path="go-basics"
            element={<Navigate to={`/go-basics/${firstGB.id}/${firstGBTopic.id}`} replace />}
          />
          <Route path="go-basics/:categoryId/:topicId" element={<GoBasicsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
