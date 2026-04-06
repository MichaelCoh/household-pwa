import { getAgeInMonths } from './ageRanges'

/**
 * Whether the member can write data in the Children section.
 * - Household owner or family_role='parent' → full read/write
 * - Teenager (16+) with family_role='child' → read/write own non-medical fields
 * - Others → read-only
 */
export function canEditChildData(member) {
  if (!member) return false
  if (member.role === 'owner') return true
  if (member.family_role === 'parent') return true
  return false
}

export function canTeenagerEditOwn(member, childDob) {
  if (!member || !childDob) return false
  if (member.family_role !== 'child') return false
  const months = getAgeInMonths(childDob)
  return months >= 16 * 12
}

const MEDICAL_FIELDS = new Set([
  'allergies',
  'medications',
  'pediatrician_name',
  'pediatrician_phone',
  'vaccinations',
])

export function isMedicalField(fieldName) {
  return MEDICAL_FIELDS.has(fieldName)
}

export function canEditField(member, childDob, fieldName) {
  if (canEditChildData(member)) return true
  if (canTeenagerEditOwn(member, childDob)) {
    return !isMedicalField(fieldName)
  }
  return false
}
