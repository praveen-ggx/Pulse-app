import type { LaneOffer } from '@/features/network/services/laneOffers.service';
import {
  laneOfferAction,
  laneOfferErrorMessage,
  laneOfferSourceLabel,
  laneOffersDialogMode,
} from '../laneOffers.util';

const page = (p: Partial<{
  network_open: boolean;
  marketplace_open: boolean;
  network_count: number;
  marketplace_count: number;
}>) => ({
  network_open: false,
  marketplace_open: false,
  network_count: 0,
  marketplace_count: 0,
  ...p,
});

const offer = (p: Partial<LaneOffer>): LaneOffer => ({
  offer_key: 'k',
  kind: 'market_bid',
  source_id: 's',
  source_indent_id: 'i0',
  source_indent_number: 'SAT812GOGIND003892',
  channel: 'marketplace',
  bidder_type: 'organization',
  bidder_organization_id: 'o',
  bidder_name: 'Carrier',
  amount: 31500,
  created_at: '2026-11-12T00:00:00Z',
  vehicles_left: null,
  valid_until: null,
  invite_id: null,
  invite_status: null,
  invite_blocker: null,
  ...p,
});

describe('laneOffersDialogMode', () => {
  it('recommends Marketplace when shared to Network only and the Network has nothing', () => {
    expect(laneOffersDialogMode(page({ network_open: true }), 0)).toBe('recommend_marketplace');
    expect(
      laneOffersDialogMode(page({ network_open: true, marketplace_count: 6 }), 0),
    ).toBe('recommend_marketplace');
  });

  it('shows offers when the Network has lane offers or commitments were attached', () => {
    expect(laneOffersDialogMode(page({ network_open: true, network_count: 1 }), 0)).toBe('offers');
    expect(laneOffersDialogMode(page({ network_open: true }), 2)).toBe('offers');
  });

  it('shows Marketplace lane bids when the load is on Marketplace', () => {
    expect(
      laneOffersDialogMode(page({ network_open: true, marketplace_open: true, marketplace_count: 6 }), 0),
    ).toBe('offers');
    expect(laneOffersDialogMode(page({ marketplace_open: true, marketplace_count: 6 }), 0)).toBe('offers');
  });

  it('stays quiet when there is nothing to show', () => {
    expect(laneOffersDialogMode(page({ marketplace_open: true }), 0)).toBe('none');
    expect(laneOffersDialogMode(page({}), 0)).toBe('none');
    expect(laneOffersDialogMode(null, 0)).toBe('none');
    expect(laneOffersDialogMode(null, 1)).toBe('offers');
  });
});

describe('laneOfferAction', () => {
  it('maps blockers to the next step instead of an invite', () => {
    expect(laneOfferAction(offer({ invite_blocker: 'needs_marketplace' }), '₹31,500').kind).toBe(
      'post_to_marketplace',
    );
    expect(laneOfferAction(offer({ invite_blocker: 'needs_network' }), '₹1').label).toBe('Network only');
    expect(laneOfferAction(offer({ invite_blocker: 'not_in_network' }), '₹1').label).toBe(
      'Not in your Network',
    );
  });

  it('adds lane commitments directly and invites bidders for consent', () => {
    expect(laneOfferAction(offer({ kind: 'pool_commitment' }), '₹30,000')).toEqual({
      kind: 'attach',
      label: 'Add at ₹30,000',
    });
    expect(laneOfferAction(offer({}), '₹31,500')).toEqual({ kind: 'invite', label: 'Invite at ₹31,500' });
    expect(laneOfferAction(offer({ invite_status: 'pending' }), '₹1').label).toBe('Invited');
    expect(laneOfferAction(offer({ invite_status: 'accepted' }), '₹1').label).toBe('Accepted');
    expect(laneOfferAction(offer({ invite_status: 'declined' }), '₹2').label).toBe('Invite again at ₹2');
    expect(laneOfferAction(offer({ invite_status: 'expired' }), '₹2').label).toBe('Invite again at ₹2');
  });
});

describe('laneOfferSourceLabel', () => {
  it('describes where the offer comes from', () => {
    expect(laneOfferSourceLabel(offer({}))).toBe('Bid on SAT812GOGIND003892');
    expect(laneOfferSourceLabel(offer({ source_indent_number: null }))).toBe('Bid on this lane');
    expect(laneOfferSourceLabel(offer({ kind: 'pool_commitment', vehicles_left: 1 }))).toBe(
      'Lane rate · 1 vehicle left',
    );
    expect(laneOfferSourceLabel(offer({ kind: 'pool_commitment', vehicles_left: 3 }))).toBe(
      'Lane rate · 3 vehicles left',
    );
  });
});

describe('laneOfferErrorMessage', () => {
  it('maps server codes to plain messages and falls back to the raw text', () => {
    expect(laneOfferErrorMessage(new Error('already_bid'))).toBe(
      'This carrier already has an offer on this load.',
    );
    expect(laneOfferErrorMessage(new Error('invite_not_pending'))).toBe(
      'This request was already answered.',
    );
    expect(laneOfferErrorMessage(new Error('boom'))).toBe('boom');
    expect(laneOfferErrorMessage(null)).toBe('Something went wrong. Please try again.');
  });
});
