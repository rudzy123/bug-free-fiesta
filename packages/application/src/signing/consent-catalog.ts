import type { ConsentDisclosure, ConsentDisclosureCatalog } from '@esign/domain';

const DEFAULT_DISCLOSURE: ConsentDisclosure = {
  copyId: 'esign-disclosure-v1',
  version: '1',
  title: 'Electronic signature consent',
  text: 'By selecting Agree, you confirm that you have reviewed this document and intend to sign electronically. This text is a product placeholder and is not legal advice.',
};

export function createConsentDisclosureCatalog(
  disclosure: ConsentDisclosure = DEFAULT_DISCLOSURE,
): ConsentDisclosureCatalog {
  return {
    current: () => disclosure,
    findByCopyId: (copyId) => (copyId === disclosure.copyId ? disclosure : null),
  };
}
