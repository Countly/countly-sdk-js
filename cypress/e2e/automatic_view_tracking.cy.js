/* eslint-disable require-jsdoc */

const fixture = "./cypress/fixtures/automatic_views.html";
const appKey = "AUTO_VIEWS_APP_KEY";

/**
 * The names of the views that started, in their order
 * @param {Array} events - the stored event queue
 * @returns {Array} view names
 */
function startedViews(events) {
    return events.filter((e) => e.key === "[CLY]_view" && e.segmentation && e.segmentation.visit === 1).map((e) => e.segmentation.name);
}

/**
 * The page addresses of the views that started, in their order
 * @param {Array} events - the stored event queue
 * @returns {Array} view addresses
 */
function startedViewUrls(events) {
    return events.filter((e) => e.key === "[CLY]_view" && e.segmentation && e.segmentation.visit === 1).map((e) => e.segmentation.view);
}

describe("Automatic view tracking", () => {
    it("Records the page at init and a view for each page a single-page app moves to, but not for a new query, a hash or an excluded page", () => {
        cy.visit(fixture);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            const steps = [
                () => win.history.pushState({}, "", "/app/a"),
                () => win.history.pushState({}, "", "/app/a?tab=2"),
                () => win.history.replaceState({}, "", "/app/b"),
                () => {
                    win.location.hash = "#inner";
                },
                () => win.history.pushState({}, "", "/private/settings"),
                () => win.history.back()
            ];
            steps.forEach((step) => cy.wait(100).then(step));
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq)).to.deep.equal([firstPage, "/app/a", "/app/b", "/app/b"]);
            });
        });
    });

    it("Records a view for each page address even when getViewName gives two pages the same name, as a route pattern does", () => {
        cy.visit(fixture + "?names=pattern");
        cy.window().then((win) => {
            ["/products/42", "/products/43", "/products/43?tab=reviews"].forEach((path) => cy.wait(100).then(() => win.history.pushState({}, "", path)));
            cy.fetch_local_event_queue(appKey).then((eq) => {
                const views = startedViews(eq);
                expect(views.slice(1), "the views of the product pages").to.deep.equal(["/products/:id", "/products/:id"]);
            });
        });
    });

    it("Names a view by the route a router shows once it updated it, whether the router changes the address first or the browser does", () => {
        cy.visit(fixture + "?names=router");
        cy.window().then((win) => {
            cy.wait(100).then(() => win.routerNavigate("/products/42"));
            cy.wait(100).then(() => win.routerNavigate("/about"));
            cy.wait(100).then(() => win.history.back());
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq).slice(1), "a link to a product, a link to another route, the back button").to.deep.equal(["/products/:id", "/about", "/products/:id"]);
            });
        });
    });

    it("Records only the page an app ends on when it changes the address twice in one go, as a redirect does", () => {
        cy.visit(fixture);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            win.history.pushState({}, "", "/login");
            win.history.replaceState({}, "", "/home");
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq)).to.deep.equal([firstPage, "/home"]);
            });
        });
    });

    it("In the default auto mode, records a view for each route of a hash router, named by its route, and none for a plain anchor", () => {
        cy.visit(fixture);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            const steps = [
                () => {
                    win.location.hash = "#details";
                },
                () => {
                    win.location.hash = "#/products/42";
                },
                () => win.history.pushState({}, "", "#/products/42?tab=reviews"),
                () => {
                    win.location.hash = "#!/about";
                }
            ];
            steps.forEach((step) => cy.wait(100).then(step));
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq), "the names").to.deep.equal([firstPage, "/products/42", "/about"]);
                expect(startedViewUrls(eq), "the addresses").to.deep.equal([firstPage, firstPage + "#/products/42", firstPage + "#!/about"]);
            });
        });
    });

    it("In history mode, records no view for a hash route", () => {
        cy.visit(fixture + "?mode=history");
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            cy.wait(100).then(() => {
                win.location.hash = "#/products/42";
            });
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq)).to.deep.equal([firstPage]);
            });
        });
    });

    it("In hash mode, records every hash as a page, and the page with no hash as /", () => {
        cy.visit(fixture + "?mode=hash");
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            cy.wait(100).then(() => {
                win.location.hash = "#details";
            });
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq), "the names").to.deep.equal(["/", "details"]);
                expect(startedViewUrls(eq), "the addresses").to.deep.equal([firstPage + "#/", firstPage + "#details"]);
            });
        });
    });

    it("Tells pages apart by the getViewUrl the app gives, over the mode", () => {
        cy.visit(fixture + "?mode=hash&url=path");
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            cy.wait(100).then(() => {
                win.location.hash = "#/products/42";
            });
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViewUrls(eq), "one view, as the address the app gives stays the same").to.deep.equal([firstPage]);
            });
        });
    });

    it("Ignores track_pageview and track_view while it is on", () => {
        cy.visit(fixture);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            win.Countly.track_pageview("manual page");
            win.Countly.track_view("manual view");
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq)).to.deep.equal([firstPage]);
            });
        });
    });

    it("Starts a view for the page that is shown after a device ID change without merge", () => {
        cy.visit(fixture);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            const oldId = win.Countly.get_device_id();
            win.Countly.change_id("auto-views-new-user");
            cy.fetch_local_request_queue(appKey).then((rq) => {
                var viewsOfOldUser = rq.filter((r) => r.device_id === oldId && r.events).reduce((all, r) => all.concat(startedViews(JSON.parse(r.events))), []);
                expect(viewsOfOldUser, "the view sent for the previous ID").to.deep.equal([firstPage]);
                cy.fetch_local_event_queue(appKey).then((eq) => {
                    expect(startedViews(eq), "the view started for the new ID").to.deep.equal([firstPage]);
                });
            });
        });
    });

    it("Starts recording page changes when the server's behavior settings turn it on (avt), with the init option off", () => {
        cy.visit("./cypress/fixtures/automatic_views_server.html?auto=0&avt=1");
        cy.wait(1500);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            win.history.pushState({}, "", "/app/a");
            cy.fetch_local_event_queue("AVT_APP_KEY").then((eq) => {
                expect(startedViews(eq)).to.deep.equal([firstPage, "/app/a"]);
            });
        });
    });

    it("Records the page once when the server's behavior settings turn it on (avt) after the page recorded its view with track_pageview", () => {
        cy.visit("./cypress/fixtures/automatic_views_server.html?auto=0&avt=0&manual=1");
        cy.wait(1500);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            win.serverAvt = true;
            // the answer that turns it on comes after the manual view, as a first visit's answer from the network does
            win.Countly.change_id("avt-merged-user", true);
            cy.wait(1500).then(() => {
                win.history.pushState({}, "", "/app/a");
                cy.fetch_local_event_queue("AVT_APP_KEY").then((eq) => {
                    expect(startedViews(eq)).to.deep.equal([firstPage, "/app/a"]);
                });
            });
        });
    });

    it("Records the page once when the server's behavior settings turn it off and on again (avt) while the visitor stays on it", () => {
        cy.visit("./cypress/fixtures/automatic_views_server.html?auto=1&avt=1");
        cy.wait(1500);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            win.serverAvt = false;
            // a device ID change with merge keeps the visitor and fetches the behavior settings again
            win.Countly.change_id("avt-merged-user", true);
            cy.wait(1500).then(() => {
                win.history.pushState({}, "", "/app/off");
                win.history.replaceState({}, "", firstPage);
                win.serverAvt = true;
                win.Countly.change_id("avt-merged-user-2", true);
                cy.wait(1500).then(() => {
                    win.history.pushState({}, "", "/app/b");
                    cy.fetch_local_event_queue("AVT_APP_KEY").then((eq) => {
                        expect(startedViews(eq), "no view while it was off, none again for the page the visitor stayed on, one for the next page").to.deep.equal([firstPage, "/app/b"]);
                    });
                });
            });
        });
    });

    it("Records no page changes when the server's behavior settings turn it off (avt) with the init option on, and takes manual views", () => {
        cy.visit("./cypress/fixtures/automatic_views_server.html?auto=1&avt=0");
        cy.wait(1500);
        cy.window().then((win) => {
            win.history.pushState({}, "", "/app/a");
            win.Countly.track_pageview("manual page");
            cy.fetch_local_event_queue("AVT_APP_KEY").then((eq) => {
                expect(startedViews(eq)).to.deep.equal(["manual page"]);
            });
        });
    });

    it("Stops recording page changes when a later behavior settings answer turns it off (avt)", () => {
        cy.visit("./cypress/fixtures/automatic_views_server.html?auto=1&avt=1");
        cy.wait(1500);
        cy.window().then((win) => {
            const firstPage = win.location.pathname;
            win.serverAvt = false;
            // a device ID change fetches the behavior settings again
            win.Countly.change_id("avt-next-user");
            win.history.pushState({}, "", "/app/b");
            cy.fetch_local_event_queue("AVT_APP_KEY").then((eq) => {
                expect(startedViews(eq), "the view the new ID started, and none for the page change after the answer").to.deep.equal([firstPage]);
            });
        });
    });

    it("Records nothing for page changes while the option is off", () => {
        cy.visit(fixture + "?auto=0");
        cy.window().then((win) => {
            win.history.pushState({}, "", "/app/a");
            win.history.pushState({}, "", "/app/b");
            cy.fetch_local_event_queue(appKey).then((eq) => {
                expect(startedViews(eq)).to.deep.equal([]);
            });
        });
    });
});
