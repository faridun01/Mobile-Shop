import { dateRangeForPeriod } from '../server/src/common/business-date';

console.log('SPECIFIC_MONTH 2026-09:', dateRangeForPeriod('SPECIFIC_MONTH', '2026-09'));
console.log('SPECIFIC_MONTH 2026-08:', dateRangeForPeriod('SPECIFIC_MONTH', '2026-08'));
console.log('TODAY:', dateRangeForPeriod('TODAY'));
console.log('ALL:', dateRangeForPeriod('ALL'));
