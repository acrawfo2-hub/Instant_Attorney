// Plain-Node stub for `next/server`. The real subpath relies on Next's bundler
// export conditions and won't resolve under `node --test`, so the alias loader
// maps `next/server` here for route tests. Only the surface the route handlers
// actually use is implemented: NextResponse.json(...) and a NextRequest shape.
export class NextResponse {
  constructor(body, status) {
    this.body = body;
    this.status = status;
  }
  async json() {
    return this.body;
  }
  static json(body, init) {
    return new NextResponse(body, (init && init.status) || 200);
  }
}

export class NextRequest {}
