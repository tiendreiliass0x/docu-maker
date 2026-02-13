import { basename, extname, join } from 'path';
import { existsSync } from 'fs';
import { parseMultipart } from '../lib/multipart';

type UploadsRouteArgs = {
  req: Request;
  pathname: string;
  method: string;
  uploadsDir: string;
  corsHeaders: Record<string, string>;
  verifyAccessKey: (req: Request) => boolean;
};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const getContentType = (ext: string): string => {
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
};

const jsonHeaders = (corsHeaders: Record<string, string>) => ({
  ...corsHeaders,
  'Content-Type': 'application/json',
});

export const handleUploadsRoutes = async (args: UploadsRouteArgs): Promise<Response | null> => {
  const { req, pathname, method, uploadsDir, corsHeaders, verifyAccessKey } = args;

  if (pathname.startsWith('/uploads/')) {
    const filename = basename(pathname);
    const filePath = join(uploadsDir, filename);
    if (existsSync(filePath)) {
      const ext = extname(filename).toLowerCase();
      const file = Bun.file(filePath);
      return new Response(file, { headers: { ...corsHeaders, 'Content-Type': getContentType(ext) } });
    }
    return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/upload' && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });

    const { files } = await parseMultipart(req);
    const imageFile = files.find(file => IMAGE_EXTENSIONS.includes(extname(file.filename).toLowerCase()));
    if (!imageFile) {
      return new Response(JSON.stringify({ error: 'No valid image uploaded' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }

    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${extname(imageFile.filename)}`;
    const filePath = join(uploadsDir, uniqueName);
    await Bun.write(filePath, imageFile.data);

    return new Response(JSON.stringify({ success: true, url: `/uploads/${uniqueName}`, filename: uniqueName }), {
      headers: jsonHeaders(corsHeaders),
    });
  }

  return null;
};
