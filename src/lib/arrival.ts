/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* Hash fragment appended when switching url ↔ box. The subdomains are
 * different origins, so sessionStorage can't carry the hint — the URL can. */
export const ARRIVAL_HASH = "koza:switch-arrival";

/* Runs in <head> before first paint: hash → html[data-arrive], then strip it. */
export const ARRIVAL_SCRIPT = `(function(){try{if(location.hash==="#${ARRIVAL_HASH}"){document.documentElement.setAttribute("data-arrive","");history.replaceState(null,"",location.pathname+location.search)}}catch(e){}})();`;
