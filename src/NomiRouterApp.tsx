import React from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import NomiStudioApp from './workbench/NomiStudioApp'
import { buildStudioUrl } from './utils/appRoutes'
import { getAppRoutePath } from './utils/routes'

function RedirectToStudio(): JSX.Element {
  const location = useLocation()
  return <Navigate to={`${buildStudioUrl()}${location.search || ''}`} replace />
}

export default function NomiRouterApp(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path={getAppRoutePath('NomiStudioApp')} element={<NomiStudioApp />} />
        <Route path={getAppRoutePath('RedirectToStudio', '/')} element={<RedirectToStudio />} />
        <Route path={getAppRoutePath('RedirectToStudio', '/workspace/*')} element={<RedirectToStudio />} />
        <Route path={getAppRoutePath('RedirectToStudio', '*')} element={<RedirectToStudio />} />
      </Routes>
    </HashRouter>
  )
}
