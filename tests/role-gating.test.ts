import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

// Import all 6 write routes
import { POST as cucinagoUpload } from '@/app/api/upload/cucinago/route';
import { POST as financialUpload } from '@/app/api/upload/financial/route';
import { POST as itemsUpload } from '@/app/api/upload/items/route';
import { POST as salesUpload } from '@/app/api/upload/sales/route';
import { POST as contractUpload } from '@/app/api/upload/[contract_id]/route';
import { POST as pnl } from '@/app/api/pnl/route';

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.runIf(shouldRunIntegration)('Role-Gating (Integración contra STG)', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, key);
  
  const locationId = 'bbbbbbbb-0000-0000-0000-000000000001';
  
  let ownerToken = '';
  let managerToken = '';
  let encargadoToken = '';
  let staffToken = '';
  
  beforeAll(async () => {
    // Authenticate roles
    const authRoles = [
      { email: process.env.QA_OWNER_EMAIL!, pass: process.env.QA_OWNER_PASSWORD! },
      { email: process.env.QA_MANAGER_EMAIL!, pass: process.env.QA_MANAGER_PASSWORD! },
      { email: process.env.QA_ENCARGADO_EMAIL!, pass: process.env.QA_ENCARGADO_PASSWORD! },
      { email: process.env.QA_STAFF_EMAIL!, pass: process.env.QA_STAFF_PASSWORD! }
    ];
    
    const tokens = await Promise.all(authRoles.map(async r => {
      const { data } = await supabase.auth.signInWithPassword({ email: r.email, password: r.pass });
      return data.session?.access_token || '';
    }));
    
    [ownerToken, managerToken, encargadoToken, staffToken] = tokens;
  });

  const routes = [
    { name: 'upload/cucinago', handler: cucinagoUpload },
    { name: 'upload/financial', handler: financialUpload },
    { name: 'upload/items', handler: itemsUpload },
    { name: 'upload/sales', handler: salesUpload },
    { name: 'upload/[contract_id]', handler: contractUpload },
    { name: 'pnl', handler: pnl }
  ];
  
  function createReq(token: string, name: string) {
    const isForm = name.startsWith('upload/sales') || name.startsWith('upload/items') || name.startsWith('upload/financial') || name.startsWith('upload/[contract_id]');
    
    let body: any;
    let headers: any = { 'Authorization': `Bearer ${token}` };
    
    if (isForm) {
      const formData = new FormData();
      formData.append('org_id', '34c8a1d0-dd1a-4b41-bd87-00265a74b0a3');
      formData.append('location_id', locationId);
      
      let fieldName = 'items';
      if (name.includes('sales')) fieldName = 'ventas';
      if (name.includes('financial')) fieldName = 'financial';
      if (name.includes('contract')) fieldName = 'ventas'; // maxirest-sales uses ventas

      formData.append(fieldName, new Blob(['']), 'dummy.csv');
      body = formData;
    } else {
      body = JSON.stringify({ 
        location_id: locationId, 
        org_id: '34c8a1d0-dd1a-4b41-bd87-00265a74b0a3',
        from: '2026-07-01',
        to: '2026-07-31'
      });
      headers['Content-Type'] = 'application/json';
    }

    return new NextRequest(`http://localhost/api/test?location_id=${locationId}`, {
      method: 'POST',
      headers,
      body
    });
  }

  for (const { name, handler } of routes) {
    const ctx = { params: Promise.resolve({ contract_id: 'maxirest-sales' }) };

    it(`Owner recibe 400 (Bad Request) o 200 pero NO 403 en la ruta ${name}`, async () => {
      const res = await handler(createReq(ownerToken, name), ctx as any);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
    
    it(`Manager recibe 403 en la ruta ${name}`, async () => {
      const res = await handler(createReq(managerToken, name), ctx as any);
      expect(res.status).toBe(403);
    });

    it(`Encargado recibe 403 en la ruta ${name}`, async () => {
      const res = await handler(createReq(encargadoToken, name), ctx as any);
      expect(res.status).toBe(403);
    });

    it(`Staff recibe 403 en la ruta ${name}`, async () => {
      const res = await handler(createReq(staffToken, name), ctx as any);
      expect(res.status).toBe(403);
    });
  }
});
