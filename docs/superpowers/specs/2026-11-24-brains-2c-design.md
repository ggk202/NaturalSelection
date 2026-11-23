# Project 2c: Intelligence, Signals and the Viewer — Design

The user approved building 2c without further input. Choices marked *(Claude)* are mine.
This completes project 2 and lays the groundwork for project 5 (proto-language).

## Intent
Make thinking visible and costly, and give creatures a channel to communicate. Meaning is **not** scripted:
creatures get a voice, ears and a sense of kinship, and evolution decides whether calls mean anything.
The analytics only detect meaning; they never create it.

## Goals
- **Intelligence stat** *(Claude)*: `hidden + 0.25·connections + 20·lr + 2·(reads map)`. It is shown in the inspector
  and as a Traits series. Its energy cost already exists (brain upkeep from 2a/2b).
- **Kin sense:** relatedness `max(0, 1 − genomeDistance/0.5)`, from 1 for a clone down to 0 for strangers.
  The new input **kinNear** gives the relatedness of the nearest visible creature.
- **Voice** (3 new outputs):
  - `call`: the creature calls when it is above 0.5; loudness = (call − 0.5)·2.
  - `syllA`, `syllB`: two bits that pick one of 4 syllables (*ka, ru, mi, to*).
  - **Cost:** calling uses 0.3·loudness energy/s.
- **Hearing** (7 new inputs):
  - loudness heard for each syllable (4)
  - direction of the loudest call as sin and cos relative to the heading (2)
  - relatedness of the loudest caller (1)
  - Hearing radius = (10 + 30·loudness)·(1 + 0.25·antennae), so antennae are now ears too *(Claude)*.
  - Calls are heard on the **next** step, which keeps updates order-independent and deterministic.
- **Eavesdropping is natural:** predators hear calls too, so calling is risky.
- **Meaning detection** *(Claude)*:
  - Per species and syllable, the tracker counts each call in its context: a threat seen, food seen, kin nearby.
    It compares that against how often the context occurs anyway (base rate).
  - A syllable "means" a context when it has ≥50 calls, P(context | syllable) ≥ 0.6, and that is ≥2× the base rate.
    These fire once per species and meaning: an alarm call (threat), a food call (food) or a kin call (kin).
  - Global firsts are also recorded.
  - Each species keeps a **lexicon** (syllable → meaning), which the inspector shows.
- **Viewer:**
  - **memory overlay**: the inspected creature's mental map drawn over the terrain (food green, danger red), with a toggle
  - **call rings**: expanding rings in the 3D view, coloured by syllable
  - **inspector**: intelligence, kin, and what the creature is hearing and saying
  - **Signals graph tab**: calls per minute for each syllable
- Schema version 5.

## Non-goals
- Syllable sequences or grammar (project 5).
- Learned meaning inheritance beyond what genes and maps already carry.

## Constraints
Deterministic, identical roundtrip continuation, and all existing suites stay green.
