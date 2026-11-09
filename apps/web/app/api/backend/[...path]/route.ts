import { NextRequest, NextResponse } from 'next/server';

function getTargetBaseUrl(): string {
  const envUrl = process.env.API_URL || process.env.INTERNAL_API_URL;
  if (envUrl) {
    return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
  }
  return 'http://127.0.0.1:4000';
}

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const baseUrl = getTargetBaseUrl();
  const targetUrl = new URL(`${baseUrl}/api/${path.join('/')}${req.nextUrl.search}`);

  const headers = new Headers(req.headers);
  headers.delete('host');

  try {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();

    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body
    });

    const resHeaders = new Headers(response.headers);
    resHeaders.delete('content-encoding');
    resHeaders.delete('content-length');

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders
    });
  } catch (err: unknown) {
    console.error(`[Proxy Error] Failed to proxy ${req.method} to ${targetUrl}:`, err);
    return NextResponse.json(
      { error: `Backend service unavailable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
