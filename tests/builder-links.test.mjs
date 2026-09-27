import test from "node:test";
import assert from "node:assert/strict";
import { linkifyBuilderText } from "../src/web/builder-links.mjs";
const refs=new Map([["druid",{id:"druid-id",name:"Druid",kind:"class"}],["circle of the land",{id:"land-id",name:"Circle of the Land",kind:"subclass"}],["circle",{id:"circle-id",name:"Circle",kind:"entry"}]]);
test("does not link entity names inside larger words",()=>{const html=linkifyBuilderText("A Druid learns Druidic secrets.",refs);assert.match(html,/>Druid<\/a>/);assert.match(html,/Druidic secrets/);assert.doesNotMatch(html,/>Druid<\/a>ic/);});
test("prefers longest entity name",()=>{const html=linkifyBuilderText("Choose Circle of the Land.",refs);assert.match(html,/entity\/land-id/);assert.doesNotMatch(html,/entity\/circle-id/);});
test("does not self-link current entity",()=>{const html=linkifyBuilderText("A Druid can join the Circle of the Land.",refs,"druid-id");assert.doesNotMatch(html,/entity\/druid-id/);assert.match(html,/entity\/land-id/);});
test("links the same target once per text block",()=>{const html=linkifyBuilderText("Druid. Druid. Druid.",refs);assert.equal((html.match(/entity\/druid-id/g)||[]).length,1);});
