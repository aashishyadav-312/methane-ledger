// Research sources behind the model and the price scenarios (docs/SPEC_V1.md "Sources"), and the contact line.
// Text only: no figures from the model live here.

export interface ResearchSource {
  label: string;
  /** `null` for documents that are not online (project files). */
  url: string | null;
}

export const RESEARCH_SOURCES: ResearchSource[] = [
  {
    label: 'GMI, Moonidih CMM project profile (Bharat Coking Coal, CMPDI)',
    url: 'https://development.globalmethane.org/expo-docs/posters/CoalMines/CM_IN_Project_Moonidih-from-ARI_FINAL.pdf',
  },
  {
    label: 'Prusty, Patra and Harpalani, Assessment of sealed off areas at Moonidih mine (GMI)',
    url: 'https://development.globalmethane.org/expo-docs/canada13/coal_24_Prusty_Presentation.pdf',
  },
  {
    label: 'Lok Sabha Unstarred Question 4259 (26 March 2025), Annexure I: mine-wise extractable reserve on 31 March 2024',
    url: null,
  },
  {
    label: 'Our research document: Carbon Markets for Methane Abatement at Coal India’s Mines (prices, buyers, and the rules of Verra and of India’s Carbon Credit Trading Scheme, CCTS)',
    url: null,
  },
  {
    label: 'IEEFA, Methane abatement in India’s coking coal push (July 2026)',
    url: 'https://ieefa.org/resources/methane-abatement-indias-coking-coal-push-opportunities-and-costs',
  },
  {
    label: 'Ember, Global Coal Mine Methane Review 2026, chapter 4',
    url: 'https://ember-energy.org/latest-insights/global-coal-mine-methane-review-2026/cutting-cmm-this-decade-is-urgent-and-feasible',
  },
  {
    label: 'Ember, Understanding India’s coal mine methane landscape (May 2026)',
    url: 'https://ember-energy.org/latest-insights/understanding-indias-coal-mine-methane-landscape',
  },
  {
    label: 'Verra, ACM0008 Abatement of methane from coal mines',
    url: 'https://verra.org/methodologies/acm0008-abatement-of-methane-from-coal-mines/',
  },
  {
    label: 'BEE, Detailed Procedure for Offset Mechanism under CCTS (2025)',
    url: 'https://jmkresearch.com/wp-content/uploads/2025/04/Detailed-Procedure-for-Offset-Mechanism.pdf',
  },
  {
    label: 'UNECE, Best practice guidance for methane recovery from abandoned coal mines',
    url: 'https://unece.org/fileadmin/DAM/energy/images/CMM/CMM_CE/Best_Practice_Guidance_for_Effective_Methane_Recovery_and_Use_from_Abandoned_Coal_Mines_FINAL__with_covers_.pdf',
  },
];

export const DATA_REQUEST_EMAIL = 'aashish.yadav@duke.edu';
