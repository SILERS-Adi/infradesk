/**
 * IDS 1.0 — Empty State Patterns
 *
 * NOT a new component — documents when and how to use the existing EmptyState.
 * Shows the three standard empty state patterns used across InfraDesk.
 */

import { Link } from 'react-router-dom';
import { FileText, Search, Shield } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';

/**
 * PATTERN 1: No data yet — first-time empty
 * USE WHEN: User has no records of this type.
 * Always include a CTA to create the first record.
 */
export function EmptyStateFirstTime() {
  return (
    <Card>
      <EmptyState
        icon={<FileText style={{ width: 22, height: 22, color: 'var(--td)' }} />}
        title="Brak dokumentów"
        description="Utwórz pierwszy dokument klikając przycisk poniżej."
        action={
          <Link to="./new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="sm">Utwórz dokument</Button>
          </Link>
        }
      />
    </Card>
  );
}

/**
 * PATTERN 2: No search results
 * USE WHEN: User searched/filtered but nothing matches.
 * CTA suggests clearing filters, not creating new record.
 */
export function EmptyStateNoResults({ onClear }: { onClear: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<Search style={{ width: 22, height: 22, color: 'var(--td)' }} />}
        title="Brak wyników"
        description="Spróbuj zmienić kryteria wyszukiwania lub wyczyść filtry."
        action={
          <Button variant="secondary" size="sm" onClick={onClear}>Wyczyść filtry</Button>
        }
      />
    </Card>
  );
}

/**
 * PATTERN 3: Access restricted
 * USE WHEN: User's scope doesn't grant access to this resource.
 * Built into EmptyState via scopeEntity prop.
 */
export function EmptyStateRestricted() {
  return (
    <Card>
      <EmptyState
        icon={<Shield style={{ width: 22, height: 22, color: 'var(--accent)' }} />}
        title="Brak dostępu"
        description="Nie masz uprawnień do wyświetlenia tych zasobów. Skontaktuj się z administratorem."
        scopeEntity="documents"
      />
    </Card>
  );
}
