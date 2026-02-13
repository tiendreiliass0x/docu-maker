export const parseMultipart = async (req: Request): Promise<{ fields: Record<string, string>; files: { name: string; data: Uint8Array; filename: string; type: string }[] }> => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return { fields: {}, files: [] };

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) return { fields: {}, files: [] };

  const body = await req.arrayBuffer();
  const decoder = new TextDecoder();
  const data = new Uint8Array(body);
  const fields: Record<string, string> = {};
  const files: { name: string; data: Uint8Array; filename: string; type: string }[] = [];
  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
  let start = 0;

  const findBoundary = (bytes: Uint8Array, marker: Uint8Array, from: number): number => {
    for (let i = from; i <= bytes.length - marker.length; i++) {
      let match = true;
      for (let j = 0; j < marker.length; j++) {
        if (bytes[i + j] !== marker[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  };

  while (true) {
    const boundaryIndex = findBoundary(data, boundaryBytes, start);
    if (boundaryIndex === -1) break;
    const nextBoundaryIndex = findBoundary(data, boundaryBytes, boundaryIndex + boundaryBytes.length);
    if (nextBoundaryIndex === -1) break;

    const part = data.slice(boundaryIndex + boundaryBytes.length, nextBoundaryIndex);
    const partStr = decoder.decode(part);
    const headerEnd = partStr.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      start = nextBoundaryIndex;
      continue;
    }

    const headers = partStr.slice(0, headerEnd);
    const contentStart = headerEnd + 4;
    const content = part.slice(contentStart, part.length - 2);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);

    if (filenameMatch && nameMatch) {
      files.push({
        name: nameMatch[1],
        filename: filenameMatch[1],
        data: content,
        type: typeMatch?.[1] || 'application/octet-stream',
      });
    } else if (nameMatch) {
      fields[nameMatch[1]] = decoder.decode(content);
    }
    start = nextBoundaryIndex;
  }

  return { fields, files };
};
