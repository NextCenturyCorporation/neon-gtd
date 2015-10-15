'use strict';

/*
 * Copyright 2015 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

angular.module('neonDemo.directives')
.directive('newsfeed', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'TranslationService',
function(external, popups, connectionService, datasetService, errorNotificationService, translationService) {
    return {
        templateUrl: 'partials/directives/newsfeed.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindDatabase: '=',
            bindTable: '=',
            bindHeadField: '=',
            bindNameField: '=',
            bindDateField: '=',
            bindTextField: '=',
            bindFeedName: '=',
            bindFeedType: '='
        },
        link: function($scope, $element) {
            $element.addClass('newsfeed-directive');

            $scope.element = $element;
            $scope.visualizationId = "newsfeed-" + uuid();

            $scope.ASCENDING = neon.query.ASCENDING;
            $scope.DESCENDING = neon.query.DESCENDING;

            var DEFAULT_TYPE = "TWITTER";

            // The default limit and the number of news items added to the feed whenever the user scrolls to the bottom of the feed.
            var LIMIT_INTERVAL = 100;

            // Prevents translation api calls from getting too long and returning an error
            var TRANSLATION_INTERVAL = 10;

            $scope.feedName = $scope.bindFeedName || "";
            $scope.feedType = $scope.bindFeedType ? $scope.bindFeedType.toUpperCase() : DEFAULT_TYPE;
            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.selectedDate = undefined;
            $scope.errorMessage = undefined;

            // Prevent extraneous queries from onFieldChanged during updateFields.
            $scope.loadingData = false;

            // Prevent extraneous queries from handleScroll.
            $scope.loadingNews = false;

            // Whether the data displayed in the newsfeed was taken from a news event.
            $scope.newsEventData = false;

            $scope.data = {
                news: [],
                newsCount: 0,
                translatedRange: [-1, -1],
                show: {
                    heads: [],
                    names: []
                },
                highlights: {
                    heads: [],
                    names: []
                }
            };

            $scope.translationAvailable = false;
            $scope.translationLanguages = {
                fromLanguageOptions: {},
                toLanguageOptions: {},
                chosenFromLanguage: "",
                chosenToLanguage: ""
            };

            $scope.options = {
                database: {},
                table: {},
                headField: {},
                nameField: {},
                dateField: {},
                textField: {},
                sortDirection: neon.query.ASCENDING,
                limit: LIMIT_INTERVAL,
                showTranslation: false
            };

            $scope.optionsMenuButtonText = function() {
                if($scope.data.news.length) {
                    if($scope.data.news.length < $scope.data.newsCount) {
                        return $scope.data.news.length + " of " + $scope.data.newsCount + " Items";
                    }
                    return $scope.data.news.length + " Items";
                }
                return "No News";
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            /**
             * Initializes the visualization.
             * @method initialize
             * @private
             */
            var initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("news", onNews);
                $scope.messenger.subscribe("news_highlights", onNewsHighlights);
                $scope.messenger.subscribe("date_selected", onDateSelected);
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    if(!$scope.newsEventData) {
                        resetAndQueryForData();
                    }
                });

                if(translationService.hasKey()) {
                    $scope.translationAvailable = true;
                    translationService.getSupportedLanguages(getSupportedLanguagesSuccessCallback, function(response) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.message,  response.reason);
                    });
                }

                handleResize();
                $element.resize(handleResize);
                $element.find(".newsfeed").scroll(handleScroll);

                $scope.$on('$destroy', function() {
                    popups.links.deleteData($scope.visualizationId + "-head");
                    popups.links.deleteData($scope.visualizationId + "-name");
                    $scope.messenger.removeEvents();
                    $element.off("resize", handleResize);
                    $element.find(".newsfeed").off("scroll", handleScroll);
                });
            };

            /**
             * Sets the 'to' and 'from' language options for translating.
             * @param {Object} languages A mapping of language codes to their names.
             * @method getSupportedLanguagesSuccessCallback
             * @private
             */
            var getSupportedLanguagesSuccessCallback = function(languages) {
                $scope.translationLanguages.fromLanguageOptions = languages;
                $scope.translationLanguages.toLanguageOptions = languages;
            };

            /**
             * Handles resize events for this visualization.
             * @method handleResize
             * @private
             */
            var handleResize = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $element.find(".newsfeed").height($element.height() - headerHeight);
            };

            /**
             * Handles scroll events for the newsfeed in this visualization.
             * @method handleScroll
             * @private
             */
            var handleScroll = function() {
                if(!$element.find(".item")) {
                    return;
                }

                updateTopNewsItemIndex();

                // If the user has scrolled to the bottom, query for more news items and add them to the feed.
                if(!$scope.loadingNews && !$scope.newsEventData && $element.find(".item").last().position().top <= $element.height()) {
                    $scope.loadingNews = true;
                    $scope.options.limit = $scope.options.limit + LIMIT_INTERVAL;
                    queryForData(function(data) {
                        // Only add the items to the feed that aren't there already.
                        updateData(data.slice($scope.options.limit - LIMIT_INTERVAL, $scope.options.limit));
                        $scope.loadingNews = false;
                    });
                }

                if(!$scope.loadingData && $scope.options.showTranslation) {
                    // See if the news item before the first translated news item is visible; if so, translate it.
                    if($scope.data.translatedRange[0] > 0) {
                        var index = $scope.data.translatedRange[0] + 1;
                        var newsItem = $element.find(".item:nth-of-type(" + index + ")");
                        if(newsItem.position().top >= 0) {
                            translate(Math.max(0, $scope.data.translatedRange[0] - TRANSLATION_INTERVAL), $scope.data.translatedRange[0]);
                        }
                    }

                    // See if the news item after the final translated news item is visible; if so, translate it.
                    if($scope.data.translatedRange[1] > 0 && $scope.data.translatedRange[1] < $scope.data.news.length) {
                        var index = $scope.data.translatedRange[1] + 1;
                        var newsItem = $element.find(".item:nth-of-type(" + index + ")");
                        if(newsItem.position().top <= $element.height()) {
                            translate($scope.data.translatedRange[1], Math.min($scope.data.news.length, $scope.data.translatedRange[1] + TRANSLATION_INTERVAL));
                        }
                    }
                }
            };

            /**
             * Updates the top news item index based on the position of the news item at the current top index.
             * @method updateTopNewsItemIndex
             * @private
             */
            var updateTopNewsItemIndex = function() {
                var topNewsItemIndex = $scope.topNewsItemIndex + 1;
                var topNewsItem = $element.find(".item:nth-of-type(" + topNewsItemIndex + ")");
                if(topNewsItem && topNewsItem.position().top > 0) {
                    $scope.topNewsItemIndex = Math.max(0, $scope.topNewsItemIndex - 1);
                }
                if(topNewsItem && topNewsItem.position().top + topNewsItem.outerHeight(true) < 0) {
                    $scope.topNewsItemIndex = Math.min($scope.data.news.length, $scope.topNewsItemIndex + 1);
                }
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name && !$scope.newsEventData) {
                    resetAndQueryForData();
                }
            };

            /**
             * Event handler for news events issued over Neon's messaging channels.
             * @param {Object} message A Neon news message.
             * @method onNews
             * @private
             */
            var onNews = function(message) {
                if(message.news && message.name && message.name === $scope.feedName) {
                    $scope.data.news = message.news;
                    $scope.data.news.forEach(function(item) {
                        if(item.head) {
                            item.headTranslated = item.head;
                        }
                        if(item.name) {
                            item.nameTranslated = item.name;
                        }
                        if(item.text) {
                            item.textTranslated = item.text;
                        }
                    });
                    $scope.data.newsCount = message.news.length;
                    $scope.feedType = (message.type || $scope.feedType).toUpperCase();
                    $scope.newsEventData = true;
                    $scope.topNewsItemIndex = 0;

                    if(message.news.length) {
                        refreshTranslation();
                    }
                }
            };

            /**
             * Event handler for news highlights events issued over Neon's messaging channels.
             * @param {Object} message A Neon news highlights message.
             * @method onNewsHighlights
             * @private
             */
            var onNewsHighlights = function(message) {
                if(message.name && message.name === $scope.feedName) {
                    if(message.show) {
                        $scope.data.show.heads = message.show.heads || [];
                        $scope.data.show.names = message.show.names || [];
                    }
                    if(message.highlights) {
                        $scope.data.highlights.heads = message.highlights.heads || [];
                        $scope.data.highlights.names = message.highlights.names || [];
                    }
                }
            };

            /**
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                $scope.selectedDate = message.end;
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            /**
             * Updates the list of available tables and the default table to use in this visualization from the tables in the active dataset.
             * @method updateTables
             */
            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }

                $scope.updateFields();
            };

            /**
             * Updates the list of available fields and the default fields to use in this visualization from the fields in the active dataset.
             * @method updateFields
             */
            $scope.updateFields = function() {
                $scope.loadingData = true;

                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);
                var headFieldName = $scope.bindHeadField || "";
                $scope.options.headField = _.find($scope.fields, function(field) {
                    return field.columnName === headFieldName;
                }) || datasetService.createBlankField();
                var nameFieldName = $scope.bindNameField || "";
                $scope.options.nameField = _.find($scope.fields, function(field) {
                    return field.columnName === nameFieldName;
                }) || datasetService.createBlankField();
                var dateFieldName = $scope.bindDateField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "date") || "";
                $scope.options.dateField = _.find($scope.fields, function(field) {
                    return field.columnName === dateFieldName;
                }) || datasetService.createBlankField();
                var textFieldName = $scope.bindTextField || "";
                $scope.options.textField = _.find($scope.fields, function(field) {
                    return field.columnName === textFieldName;
                }) || datasetService.createBlankField();

                $scope.feedName = $scope.bindFeedName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_name") || "";
                $scope.feedType = $scope.bindFeedType ? $scope.bindFeedType.toUpperCase() : datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_type") || DEFAULT_TYPE;

                $scope.newsEventData = false;
                resetAndQueryForData();
            };

            /**
             * Clear the data and query for new data to display in this visualization using the Neon Connection.
             * @method resetAndQueryForData
             * @private
             */
            var resetAndQueryForData = function() {
                $scope.data.news = [];
                $scope.topNewsItemIndex = 0;
                popups.links.deleteData($scope.visualizationId + "-head");
                popups.links.deleteData($scope.visualizationId + "-name");

                queryForData(function(data, connection) {
                    updateData(data);
                    refreshTranslation();
                    $scope.loadingData = false;
                    queryForNewsCount(connection);
                });
            };

            /**
             * Query for data to display in this visualization using the Neon Connection.
             * @param {Function} callback
             * @method resetAndQueryForData
             * @private
             */
            var queryForData = function(callback) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.newsEventData = false;

                var connection = connectionService.getActiveConnection();

                if(!connection || !datasetService.isFieldValid($scope.options.dateField) || !datasetService.isFieldValid($scope.options.textField)) {
                    updateData([]);
                    $scope.loadingData = false;
                    return;
                }

                var query = buildQuery();

                connection.executeQuery(query, function(results) {
                    $scope.$apply(function() {
                        callback(results.data, connection);
                    });
                }, function(response) {
                    $scope.$apply(function() {
                        callback([], connection);
                    });
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Builds the query for this visualization.
             * @method buildQuery
             * @return {neon.query.Query}
             * @private
             */
            var buildQuery = function() {
                var fields = [$scope.options.dateField.columnName, $scope.options.textField.columnName];
                if(datasetService.isFieldValid($scope.options.headField)) {
                    fields.push($scope.options.headField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.nameField)) {
                    fields.push($scope.options.nameField.columnName);
                }

                return new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).withFields(fields)
                    .sortBy($scope.options.dateField.columnName, $scope.options.sortDirection)
                    .limit($scope.options.limit);
            };

            /**
             * Updates this visualization to display the given query result data.
             * @param {Array} data The query result data containing {Object} data rows mapping column name to value.
             * @method updateData
             * @private
             */
            var updateData = function(data) {
                var mappings = datasetService.getMappings($scope.options.database.name, $scope.options.table.name);

                data.forEach(function(item) {
                    var head = datasetService.isFieldValid($scope.options.headField) ? item[$scope.options.headField.columnName] : "";
                    var name = datasetService.isFieldValid($scope.options.nameField) ? item[$scope.options.nameField.columnName] : "";
                    var hasLinks = createExternalLinksForNewsItemData(mappings, head, name);

                    $scope.data.news.push({
                        date: new Date(item[$scope.options.dateField.columnName]),
                        head: head,
                        headTranslated: head,
                        name: name,
                        nameTranslated: name,
                        text: item[$scope.options.textField.columnName],
                        textTranslated: item[$scope.options.textField.columnName],
                        linksPopupButtonJson: createLinksPopupButtonJson(head, name),
                        linksPopupButtonDisabled: !hasLinks
                    });
                });
            };

            /**
             * Creates the external links for the given news 'head' and 'name' properties using the given mappings and returns if any links were created.
             * @param {Array} mappings
             * @param {String} head
             * @param {String} name
             * @method createExternalLinksForNewsItemData
             * @private
             * @return {Boolean}
             */
            var createExternalLinksForNewsItemData = function(mappings, head, name) {
                var headLinksCount = head ? createExternalLinks(mappings, $scope.options.headField.columnName, head, $scope.visualizationId + "-head") : 0;
                var nameLinksCount = name ? createExternalLinks(mappings, $scope.options.nameField.columnName, name, $scope.visualizationId + "-name") : 0;
                return headLinksCount || nameLinksCount;
            };

            /**
             * Creates the external links for the given field and value using the given mappings, saves the links in the links popup using the given source, and
             * returns the number of links that were created.
             * @param {Array} mappings
             * @param {String} field
             * @param {Number} or {String} value
             * @param {String} source
             * @method createExternalLinks
             * @private
             * @return {Number}
             */
            var createExternalLinks = function(mappings, field, value, source) {
                var links = popups.links.createAllServiceLinkObjects(external.services, mappings, field, value);

                if(links.length) {
                    popups.links.addLinks(source, value, links);
                }

                return links.length;
            };

            /**
             * Creates and returns the JSON string for the links popup button using the given news 'head' and 'name' properties.
             * @param {String} head
             * @param {String} name
             * @method createLinksPopupButtonJson
             * @private
             * @return {String}
             */
            var createLinksPopupButtonJson = function(head, name) {
                var list = [];
                if(head) {
                    list.push({
                        source: $scope.visualizationId + "-head",
                        key: head
                    });
                }
                if(name) {
                    list.push({
                        source: $scope.visualizationId + "-name",
                        key: name
                    });
                }
                return popups.links.createButtonJsonFromList(list);
            };

            /**
             * Updates the 'from' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'from' translation language to change to
             * @method onFromLanguageChange
             */
            $scope.onFromLanguageChange = function(language) {
                $scope.translationLanguages.chosenFromLanguage = language;
                refreshTranslation();
            };

            /**
             * Updates the 'to' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'to' translation language to change to
             * @method onToLanguageChange
             */
            $scope.onToLanguageChange = function(language) {
                $scope.translationLanguages.chosenToLanguage = language;
                refreshTranslation();
            };

            /**
             * Translates all text back to its original form if checked is false, or to the specified 'to' language
             * if checked is true.
             * @param {Boolean} checked Whether 'Show Translation' is checked or unchecked
             * @param {String} fromLang The 'from' language to use for translation
             * @param {String} toLang The 'to' language to use for translation
             * @method updateTranslation
             */
            $scope.updateTranslation = function(checked, fromLang, toLang) {
                $scope.options.showTranslation = checked;
                $scope.translationLanguages.chosenFromLanguage = fromLang;
                $scope.translationLanguages.chosenToLanguage = toLang;
                refreshTranslation();
            };

            /**
             * Refreshes the translations if translation is on.
             * @method refreshTranslation
             * @private
             */
            var refreshTranslation = function() {
                $scope.data.translatedRange = [-1, -1];
                if($scope.options.showTranslation) {
                    translate($scope.topNewsItemIndex, $scope.topNewsItemIndex + TRANSLATION_INTERVAL);
                }
            };

            /**
             * Translates text within the translation limit with the from/to languages specified.
             * @param {Integer} [sliceStart] Optional field to specify at what index to start translating text at.
             * @param {Integer} [sliceEnd] Optional field to specify at what index to end translating text at (exclusive).
             * @method translate
             * @private
             */
            var translate = function(sliceStart, sliceEnd) {
                $scope.loadingData = true;

                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                sliceStart = sliceStart || 0;
                sliceEnd = sliceEnd || sliceStart + TRANSLATION_INTERVAL;

                translateNewsProperty("head", sliceStart, sliceEnd, function() {
                    translateNewsProperty("name", sliceStart, sliceEnd, function() {
                        translateNewsProperty("text", sliceStart, sliceEnd, function() {
                            $scope.data.translatedRange[0] = $scope.data.translatedRange[0] < 0 ? sliceStart : Math.min($scope.data.translatedRange[0], sliceStart);
                            $scope.data.translatedRange[1] = $scope.data.translatedRange[1] < 0 ? sliceEnd : Math.max($scope.data.translatedRange[1], sliceEnd);
                            $scope.loadingData = false;
                        });
                    });
                });
            };

            /**
             * Translates the given property in the news data between the given start and end indices.
             * @param {String} newsProperty
             * @param {Integer} sliceStart
             * @param {Integer} sliceEnd
             * @param {Function} successCallback
             * @method translateNewsProperty
             * @private
             */
            var translateNewsProperty = function(newsProperty, sliceStart, sliceEnd, successCallback) {
                var dataText = _.pluck($scope.data.news, newsProperty).filter(function(data) {
                    return data;
                });

                var translationSuccessCallback = function(response) {
                    var index = sliceStart;
                    response.data.data.translations.forEach(function(item) {
                        while(!$scope.data.news[index][newsProperty] && index < sliceEnd) {
                            index++;
                        }
                        if(index < sliceEnd) {
                            var newsItem = $scope.data.news[index];
                            newsItem[newsProperty + "Translated"] = item.translatedText;
                            newsItem.isTranslated = newsItem.isTranslated || newsItem[newsProperty] !== newsItem[newsProperty + "Translated"];
                            index++;
                        }
                    });
                    successCallback();
                };

                var translationFailureCallback = function(response) {
                    for(var i = sliceStart; i < sliceEnd; ++i) {
                        $scope.data.news[i][newsProperty + "Translated"] = $scope.data.news[i][newsProperty];
                        $scope.data.news[i].isTranslated = false;
                    }
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.message,  response.reason);
                    $scope.loadingData = false;
                };

                translationService.translate(dataText.slice(sliceStart, sliceEnd), $scope.translationLanguages.chosenToLanguage,
                    translationSuccessCallback, translationFailureCallback, $scope.translationLanguages.chosenFromLanguage);
            };

            /**
             * Query for the (non-limited) count of news data to display in this visualization using the given Neon Connection.
             * @param {Object} connection
             * @method queryForNewsCount
             * @private
             */
            var queryForNewsCount = function(connection) {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).aggregate(neon.query.COUNT, "*", "count");

                connection.executeQuery(query, function(results) {
                    $scope.$apply(function() {
                        $scope.data.newsCount = results.data[0].count;
                    });
                }, function(response) {
                    $scope.$apply(function() {
                        $scope.data.newsCount = 0;
                    });
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Triggered by changing a field in the options menu.
             * @method onFieldChanged
             */
            $scope.onFieldChanged = function() {
                if(!$scope.loadingData) {
                    $scope.newsEventData = false;
                    resetAndQueryForData();
                }
            };

            /**
             * Triggered by clicking one of the sort-by-date buttons.
             * @param {Number} direction Either $scope.ASCENDING or $scope.DESCENDING
             * @method handleSortButtonClick
             */
            $scope.handleSortButtonClick = function(direction) {
                if($scope.options.sortDirection === direction) {
                    if($scope.newsEventData) {
                        $scope.data.news.reverse();
                        $scope.data.translatedRange = [$scope.data.news.length - $scope.data.translatedRange[1], $scope.data.news.length - $scope.data.translatedRange[0]];
                    } else {
                        resetAndQueryForData();
                    }
                }
            };

            /**
             * Returns the style class for the given news item.
             * @param {Object} item
             * @method getNewsItemStyleClass
             * @return {String}
             */
            $scope.getNewsItemStyleClass = function(item) {
                var style = [];
                if($scope.selectedDate && item.date.getTime() > $scope.selectedDate.getTime()) {
                    style.push("future");
                }
                if($scope.data.highlights.heads.length || $scope.data.highlights.names.length) {
                    if($scope.data.highlights.heads.indexOf(item.head) >= 0 || $scope.data.highlights.names.indexOf(item.name) >= 0) {
                        style.push("highlight");
                    }
                }
                if($scope.data.show.heads.length || $scope.data.show.names.length) {
                    if($scope.data.show.heads.indexOf(item.head) < 0 && $scope.data.show.names.indexOf(item.name) < 0) {
                        style.push("hidden");
                    }
                }
                return style.join(" ");
            };

            neon.ready(function() {
                initialize();
                displayActiveDataset(true);
            });
        }
    };
}]);
