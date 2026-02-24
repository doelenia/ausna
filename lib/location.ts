export interface ActivityLocationValue {
  /**
   * First line for display and maps queries.
   * Typically a street + number or a place/building name.
   */
  line1?: string

  /**
   * Second-line components used for display and approximate maps queries.
   * We keep pieces so we can format \"city, state\" (US) vs \"city, country\" (non-US).
   */
  city?: string
  state?: string
  country?: string

  /**
   * Optional ISO codes for country and state/region, used to drive pickers.
   */
  countryCode?: string
  stateCode?: string

  /**
   * When true, visitors who are not members/managers/owners
   * should not see the exact line1/fullAddress. They only see coarse location.
   */
  isExactLocationPrivate?: boolean
}

