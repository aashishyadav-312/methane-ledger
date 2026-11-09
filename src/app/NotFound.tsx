import { Button } from '../ui';

export function NotFound() {
  return (
    <div className="page-width not-found">
      <h1 className="t-h2">Page not found</h1>
      <p className="t-lede">There is no page at this address.</p>
      <Button variant="primary" href="#/" arrow>
        Back to the map
      </Button>
    </div>
  );
}
