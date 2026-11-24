# Threats and Cultural Word Learning — Design

User request (2026-11-24): "Add 2 and 5. Predators are currently basically insignificant." Choices: disease, disasters
and a rival apex lineage; cultural learning of words. Other details are my calls (Claude).

## Why predators don't matter
40 sim-min kinematic runs (seeds 1 and 2): 0 carnivores ever, about 20 kills in total. Founders are herbivores, the
herbivore → carnivore path crosses weak omnivores, and the predator assist only starts once a carnivore exists.

## Rival apex lineage
- Setting `apexMin` (default 8): from the first step, carnivores are kept at or above this count.
  Refills come from the best hunters (`eliteCarn`), otherwise from a seeded apex genome: a founder body,
  diet 0.9, a big mouth, ×1.2 size, plus a hunting instinct (centre ray sees a creature → throttle and attack;
  side rays → turn toward it). Evolution may change any of this.
- The existing predator assist (`predatorMin`) is unchanged.

## Disease
- Strains `{id, virulence, contagion, duration}` spread by contact (within 1.5 units).
- Transmission can mutate the strain (5%), so virulence and contagiousness evolve.
- Recovered creatures are immune to that strain.
- A new outbreak starts on a random creature every ~3 sim-min if none is active.
- New `resistance` gene (0–1, upkeep 0.01 per unit) cuts the infection chance (up to 80%) and the drain (up to 50%).
- Inputs: `sick`, `sickSeen` (the nearest seen creature is ill).
- Sick creatures are tinted. Checkpoint kind `threat` for outbreaks.

## Disasters (every ~4 sim-min, random)
- **Wildfire:** a growing zone in a forest (to radius 15, 40 s). It burns food and objects and does 3 energy/s.
- **Flood:** a zone around a lake (radius 20, 60 s) that drains non-swimmers and non-flyers.
- **Drought:** one biome's food stops for 90 s and half its food withers.
- Fire and flood are hazard zones, so creatures already sense them (`hazardDist`). Each disaster is a `threat` checkpoint.
- Settings: Diseases, Disasters. God-mode buttons trigger an outbreak or a disaster.

## Cultural word learning
- Each creature has a small vocabulary: word → how often it heard that word while seeing a threat, food or kin. Up to 8 words.
- **Learning:** every 8 steps, a listener links the loudest heard word with what it sees itself (moving average).
- **Speaking:** the brain still decides *whether* to call. If the creature knows a word that fits its current situation
  (strength > 0.5), it says that word; otherwise the brain's syllables are used.
- **Understanding:** new inputs `heardThreat`, `heardFood` and `heardKin` give the listener's own meaning of the word it hears.
  Brains can evolve to react to learned words.
- **Inheritance:** children inherit the parent's vocabulary at half strength.
- **The player teaches** by speaking: creatures that hear "ka" while they see danger learn ka ≈ threat.
- The inspector shows each creature's vocabulary.

Schema 9.
