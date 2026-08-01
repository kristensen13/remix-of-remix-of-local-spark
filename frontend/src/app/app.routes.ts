import { Routes } from '@angular/router';
import { authGuard } from './core/auth-guard';
import { Login } from './features/login/login';
import { BusinessSearch } from './features/business-search/business-search';
import { SearchHistory } from './features/search-history/search-history';
import { GeneratedWebsites } from './features/generated-websites/generated-websites';
import { Clientes } from './features/clientes/clientes';
import { Layout } from './shared/layout/layout';
import { NotFound } from './shared/not-found/not-found';

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: 'search', component: BusinessSearch },
      { path: 'history', component: SearchHistory },
      { path: 'websites', component: GeneratedWebsites },
      { path: 'clientes', component: Clientes },
      { path: '', pathMatch: 'full', redirectTo: 'search' },
    ],
  },
  { path: '**', component: NotFound },
];
