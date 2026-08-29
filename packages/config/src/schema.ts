import { z } from 'zod';

/**
 * Zod schema for GAME_CONFIG.json.
 *
 * GAME_CONFIG.json is the authoritative source for every tunable gameplay
 * number. This file only describes its shape so the engine can consume it with
 * static types; it must never introduce or override a value.
 */

const money = z.number().int();

export const spaceKindSchema = z.enum([
  'corner',
  'city',
  'special_property',
  'treasure',
  'surprise',
  'fee',
]);

export const specialGroupSchema = z.enum(['public_works', 'hospitality', 'transport']);

const rentTableSchema = z.object({
  '0': money,
  '1': money,
  '2': money,
  '3': money,
  '4': money,
  '5': money,
});

export const gameConfigSchema = z.object({
  game: z.object({
    name: z.string(),
    version: z.string(),
    currency: z.string(),
    board_size: z.number().int(),
    corner_tiles: z.number().int(),
    property_tiles: z.number().int(),
    special_tiles: z.number().int(),
  }),
  defaults: z.object({
    max_players: z.number().int(),
    min_players: z.number().int(),
    starting_cash: money,
    turn_duration_seconds: z.number().int(),
    max_rounds: z.number().int(),
    start_pass_bonus: money,
    double_roll_limit: z.number().int(),
  }),
  territories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      cities: z.array(z.string()),
      bonus: money,
      size: z.number().int(),
    }),
  ),
  cities: z.array(z.tuple([z.string(), z.string(), money, z.string()])),
  development: z.object({
    rent_multipliers: z.record(z.string(), z.number()),
    house_cost_by_territory: z.record(z.string(), money),
    hotel_cost_same_as_house: z.boolean(),
    resale_percentage: z.number(),
    even_build_max_level_difference: z.number().int(),
  }),
  special_properties: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: money,
      group: specialGroupSchema,
    }),
  ),
  special_property_rules: z.object({
    transport: z.object({ rent: z.record(z.string(), money) }),
    hospitality: z.object({ rent: z.record(z.string(), money) }),
    public_works: z.object({
      rent_formula: z.string(),
      multipliers: z.record(z.string(), z.number()),
    }),
  }),
  event_decks: z.object({
    treasure: z.array(z.tuple([z.string(), z.string()])),
    surprise: z.array(z.tuple([z.string(), z.string()])),
    reshuffle_when_empty: z.boolean(),
    max_automatic_resolution_chain_depth: z.number().int(),
  }),
  corner_rules: z.object({
    start: z.object({ position: z.number().int(), pass_bonus: money }),
    ig_signal: z.object({
      type: z.string(),
      release_fee: money,
      max_failed_double_attempts: z.number().int(),
      release_by_doubles: z.boolean(),
      release_card_supported: z.boolean(),
    }),
    vacation: z.object({ vacation_cash_enabled: z.boolean() }),
    go_to_ig_signal: z.object({ target: z.string(), receives_start_bonus: z.boolean() }),
  }),
  fees: z.object({
    college_fees: money,
    vacation_cash_routes_fee_to_pot: z.boolean(),
  }),
  mortgage: z.object({
    enabled_by_default: z.boolean(),
    mortgage_percentage: z.number(),
    unmortgage_interest: z.number(),
    rent_while_mortgaged: money,
    building_while_mortgaged: z.boolean(),
  }),
  army: z.object({
    units: z.array(
      z.object({ id: z.string(), name: z.string(), cost: money, power: z.number().int() }),
    ),
    base_capacity: z.number().int(),
    additional_capacity_per_2_cities: z.number().int(),
    max_capacity: z.number().int(),
    resale_percentage: z.number(),
    power_formula: z.string(),
  }),
  scouting: z.object({
    cost: money,
    same_target_cooldown_rounds: z.number().int(),
    reveals: z.record(z.string(), z.string()),
  }),
  alliances: z.object({
    max_active_per_player: z.number().int(),
    duration_rounds: z.number().int(),
    post_end_cooldown_rounds: z.number().int(),
    army_lend_max_percentage_of_available_power: z.number(),
    defender_ally_must_accept: z.boolean(),
    lent_units_locked: z.boolean(),
  }),
  war: z.object({
    max_outgoing_wars_per_turn: z.number().int(),
    max_active_wars_per_player: z.number().int(),
    declaration_fee: z.object({ formula: z.string() }),
    home_defense_bonus: z.number(),
    development_defense: z.object({
      house_1: z.number().int(),
      house_2: z.number().int(),
      house_3: z.number().int(),
      house_4: z.number().int(),
      hotel: z.number().int(),
    }),
    battle_factor_min: z.number(),
    battle_factor_max: z.number(),
    casualties: z.object({
      close_battle: z.number(),
      moderate_victory: z.number(),
      decisive_victory: z.number(),
      winner_also_takes_casualties: z.boolean(),
      unit_selection: z.string(),
    }),
    capture: z.object({
      transfer_all_target_player_cities_in_selected_territory: z.boolean(),
      buildings_remain: z.boolean(),
      war_damage_rounds: z.number().int(),
      war_damage_rent_multiplier: z.number(),
      war_damage_blocks_building: z.boolean(),
    }),
    locked_during_war: z.array(z.string()),
  }),
  trade: z.object({
    allowed_assets: z.array(z.string()),
    army_trade_allowed: z.boolean(),
    alliance_trade_allowed: z.boolean(),
    atomic_execution: z.boolean(),
    locked_assets: z.array(z.string()),
  }),
  auction: z.object({
    starting_bid: money,
    bid_must_exceed_current: z.boolean(),
    bid_cannot_exceed_cash: z.boolean(),
    no_bid_result: z.string(),
    anti_sniping_extension_seconds: z.number().int(),
  }),
  bankruptcy: z.object({
    trigger: z.string(),
    liquidation_order: z.array(z.string()),
    army_transfer_to_creditor: z.boolean(),
    bank_assets_return_to_unowned: z.boolean(),
    bankruptcy_cancels: z.array(z.string()),
    player_eliminated: z.boolean(),
  }),
  victory: z.object({
    end_conditions: z.array(z.string()),
    final_score: z.record(z.string(), z.number()),
    asset_valuation: z.object({
      property: z.number(),
      buildings: z.number(),
      army: z.number(),
    }),
    tie_breakers: z.array(z.string()),
  }),
  host_settings: z.object({
    maximum_players: z.object({ default: z.number().int(), min: z.number().int(), max: z.number().int() }),
    starting_cash: z.object({ default: money, min: money, max: money }),
    turn_duration_seconds: z.object({ default: z.number().int(), min: z.number().int(), max: z.number().int() }),
    auction: z.boolean(),
    full_set_x2_rent: z.boolean(),
    vacation_cash: z.boolean(),
    rent_while_in_ig_signal: z.boolean(),
    mortgage: z.boolean(),
    even_build: z.boolean(),
    randomize_player_order: z.boolean(),
    private_room: z.boolean(),
    bots: z.boolean(),
    freeze_after_game_start: z.boolean(),
  }),
  board_order: z.array(z.tuple([z.string(), z.string(), spaceKindSchema])),
  invariants: z.array(z.string()),
  city_economics: z.record(
    z.string(),
    z.object({
      purchase_price: money,
      base_rent: money,
      rent: rentTableSchema,
      territory_id: z.string(),
      full_set_undeveloped_multiplier: z.number(),
    }),
  ),
});

export type RawGameConfig = z.infer<typeof gameConfigSchema>;
export type SpaceKind = z.infer<typeof spaceKindSchema>;
export type SpecialGroup = z.infer<typeof specialGroupSchema>;
