import { BrowserRouter, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Calendar from './pages/Calendar'
import Runs from './pages/Runs'
import RunDetail from './pages/RunDetail'
import RunReport from './pages/RunReport'
import Tests from './pages/Tests'
import TestDetail from './pages/TestDetail'
import Errors from './pages/Errors'
import Modules from './pages/Modules'
import Notes from './pages/Notes'
import Import from './pages/Import'
import Environments from './pages/Environments'
import { Empty } from './components/ui'
import { t, useLang } from './i18n'

export default function App() {
  // Al cambiar de idioma se vuelve a montar todo para que cada t() use el nuevo idioma (la URL se conserva)
  const lang = useLang()
  return (
    <BrowserRouter key={lang}>
      <Routes>
        {/* Informe imprimible: sin menú lateral */}
        <Route path="ejecucion/:id/informe" element={<RunReport />} />
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="calendario" element={<Calendar />} />
          <Route path="ejecuciones" element={<Runs />} />
          <Route path="ejecucion/:id" element={<RunDetail />} />
          <Route path="tests" element={<Tests />} />
          <Route path="test" element={<TestDetail />} />
          <Route path="errores" element={<Errors />} />
          <Route path="modulos" element={<Modules />} />
          <Route path="notas/*" element={<Notes />} />
          <Route path="entornos" element={<Environments />} />
          <Route path="importar" element={<Import />} />
          <Route path="*" element={<Empty>{t('Página no encontrada.')}</Empty>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
