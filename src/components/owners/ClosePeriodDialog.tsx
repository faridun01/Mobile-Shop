import React, { useMemo, useState } from 'react';
import { useAppFields } from '../../context/AppContext';
import { formatUserName } from '../../utils/formatUser';
import { Owner } from '../../types';
import { QuarterReportModal } from './QuarterReportModal';

interface ClosePeriodDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after the period is closed (or the attempt failed), with the message to show. */
  onResult: (result: { ok: boolean; text: string }) => void;
}

const ownerRoleRank = (role?: string) => (role === 'ADMIN' ? 0 : role === 'PARTNER' ? 1 : 2);

/**
 * Period summary and closing (every owner of the business, the admin first). Opened from the
 * stock revision page: the month ends with a stock count, then the period is closed.
 */
export const ClosePeriodDialog: React.FC<ClosePeriodDialogProps> = ({ open, onClose, onResult }) => {
  const { owners, users, stores, storeProfitShares, closeQuarterPeriod } = useAppFields(
    'owners',
    'users',
    'stores',
    'storeProfitShares',
    'closeQuarterPeriod'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { displayOwners, adminOwner } = useMemo(() => {
    const roleOf = (owner: { userId?: string }) => (owner.userId ? users.find((u) => u.id === owner.userId)?.role : undefined);
    return {
      displayOwners: [...owners].sort((a, b) => ownerRoleRank(roleOf(a)) - ownerRoleRank(roleOf(b))),
      adminOwner: owners.find((o) => roleOf(o) === 'ADMIN') || owners.find((o) => !o.storeId) || owners[0],
    };
  }, [owners, users]);

  const getOwnerDetails = (owner: Owner) => {
    const linkedUser = owner.userId ? users.find((u) => u.id === owner.userId) : undefined;
    const rawName = owner.name || linkedUser?.name;
    if (linkedUser?.role === 'ADMIN') return { name: formatUserName(rawName, 'Администратор'), roleTag: 'Администратор', roleSub: 'Владелец & Управляющий' };
    if (linkedUser?.role === 'PARTNER') return { name: formatUserName(rawName, 'Партнер'), roleTag: 'Партнер', roleSub: 'Соучредитель бизнеса' };
    return { name: formatUserName(rawName, 'Владелец'), roleTag: 'Владелец', roleSub: 'Совладелец бизнеса' };
  };

  const ownerShareLabel = (ownerId: string) => {
    if (ownerId === adminOwner?.id) return 'остаток прибыли магазинов';
    const pairs = storeProfitShares.filter((sh) => sh.ownerId === ownerId);
    if (!pairs.length) return 'доля не задана';
    return pairs.map((sh) => `${stores.find((st) => st.id === sh.storeId)?.name || 'Магазин'} ${sh.sharePercent}%`).join(', ');
  };

  const handleConfirmClose = async (data: { quarterName: string; transferRemainingToCapital: boolean }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await closeQuarterPeriod({ quarterName: data.quarterName, transferRemainingToCapital: data.transferRemainingToCapital });
      onResult(res.success
        ? { ok: true, text: `Финансовый период «${data.quarterName}» успешно закрыт` }
        : { ok: false, text: res.message || 'Ошибка закрытия периода' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <QuarterReportModal
      open={open}
      onClose={onClose}
      onConfirmClose={handleConfirmClose}
      displayOwners={displayOwners}
      getOwnerDetails={getOwnerDetails}
      ownerShareLabel={ownerShareLabel}
      isSubmitting={isSubmitting}
    />
  );
};
