import { formatMarketplaceTransactionError } from '../marketplaceErrorFormat.util';

describe('formatMarketplaceTransactionError DCO boundary', () => {
  it('does not show raw PostgreSQL text for DCO employment denial', () => {
    expect(
      formatMarketplaceTransactionError(
        'dco_not_employee_driver: DCOs cannot join a business as employee drivers. You can operate independently as a DCO.',
      ),
    ).toBe(
      'DCOs cannot join a business as employee drivers. You can operate independently as a DCO.',
    );
  });

  it('does not show raw PostgreSQL text for Marketplace access denial', () => {
    expect(
      formatMarketplaceTransactionError(
        'marketplace_access_denied: approved, independent DCO status with an active vehicle is required',
      ),
    ).toBe(
      'Marketplace bidding is for DCOs with an active vehicle. You can operate independently as a DCO.',
    );
  });
});

describe('formatMarketplaceTransactionError submit_market_bid indent checks', () => {
  it('maps indent_not_open to the closed-load message', () => {
    expect(
      formatMarketplaceTransactionError('indent_not_open: this load is no longer open for bids'),
    ).toBe('This load is no longer open for bidding.');
  });

  it('maps not_marketplace_circulated to an actionable message', () => {
    expect(
      formatMarketplaceTransactionError(
        'not_marketplace_circulated: this load is not offered on Marketplace',
      ),
    ).toBe('This load is not offered on Marketplace.');
  });

  it('maps own_indent through the existing own-load message', () => {
    expect(
      formatMarketplaceTransactionError("own_indent: you cannot bid on your own organization's load"),
    ).toBe("You can't bid on your own organization's load.");
  });
});

describe('formatMarketplaceTransactionError bid expiry', () => {
  it('maps bid_expired without leaking the raw database text', () => {
    expect(
      formatMarketplaceTransactionError('bid_expired: bid 3f2c is no longer acceptable'),
    ).toBe('This bid has expired and can no longer be accepted.');
  });
});

describe('formatMarketplaceTransactionError quote checks', () => {
  it('maps quote_locked to a countered-or-decided message', () => {
    expect(
      formatMarketplaceTransactionError('quote_locked: quote has been countered or decided'),
    ).toBe('This quote has been countered or decided and can no longer be changed.');
  });

  it('maps invalid_amount to an actionable message', () => {
    expect(
      formatMarketplaceTransactionError('invalid_amount: amount must be greater than zero'),
    ).toBe('Enter a valid bid amount greater than zero.');
  });

  it('maps indent_not_visible without leaking the raw code', () => {
    expect(
      formatMarketplaceTransactionError('indent_not_visible: indent is not visible to this organization'),
    ).toBe('This load is not available to your organization.');
  });
});
