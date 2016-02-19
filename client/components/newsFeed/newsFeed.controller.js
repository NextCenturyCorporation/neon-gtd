'use strict';

/*
 * Copyright 2016 Next Century Corporation
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

angular.module('neonDemo.directives').controller('newsFeedController', ['$scope', '$timeout', function($scope, $timeout) {
    $scope.active.ASCENDING = neon.query.ASCENDING;
    $scope.active.DESCENDING = neon.query.DESCENDING;
    $scope.active.TWITTER = "TWITTER";

    var DEFAULT_TYPE = "NEWS";

    var DEFAULT_LINKY_CONFIG = {
        mentions: false,
        hashtags: false,
        urls: true,
        linkTo: ""
    };

    // The default limit and the number of news items added to the feed whenever the user scrolls to the bottom of the feed.
    var LIMIT_INTERVAL = 50;

    // Prevents translation api calls from getting too long and returning an error
    var TRANSLATION_INTERVAL = 10;

    // The data in this newsfeed from a news event or an empty array if the data in this newsfeed is from a query.
    var newsEventData = [];

    // The total count of available news data (the active news data is a subset of the total).
    var newsTotalCount = 0;

    // The range of indices in the news data that have been translated.
    var translatedIndexRange = [-1, -1];

    // The data from a news highlights event.
    var newsHighlights = {
        show: {
            primaryTitles: [],
            secondaryTitles: []
        },
        highlights: {
            primaryTitles: [],
            secondaryTitles: []
        }
    };

    $scope.active.contentField = {};
    $scope.active.data = [];
    $scope.active.dateField = {};
    $scope.active.limit = LIMIT_INTERVAL;
    $scope.active.primaryTitleField = {};
    $scope.active.secondaryTitleField = {};
    $scope.active.sortDirection = neon.query.ASCENDING;

    $scope.functions.createMenuText = function() {
        if($scope.active.data.length) {
            if($scope.active.data.length < newsTotalCount) {
                return $scope.active.data.length + " of " + newsTotalCount + " Items";
            }
            return $scope.active.data.length + " Items";
        }
        return "No News";
    };

    $scope.functions.showMenuText = function() {
        return true;
    };

    $scope.functions.onInit = function() {
        $scope.functions.subscribe("news", onNews);
        $scope.functions.subscribe("news_highlights", onNewsHighlights);
        $scope.functions.subscribe("date_selected", function(message) {
            $scope.selectedDate = message.end;
        });
        $scope.functions.getElement(".newsfeed").scroll(updateNewsfeedOnScroll);
    };

    $scope.functions.onDestroy = function() {
        $scope.functions.getElement(".newsfeed").off("scroll", updateNewsfeedOnScroll);
    };

    /**
     * Updates the newsfeed due to a scroll event.
     * @method updateNewsfeedOnScroll
     * @private
     */
    var updateNewsfeedOnScroll = function() {
        var element = $scope.functions.getElement();
        if(!element.find(".item")) {
            return;
        }

        updateTopNewsItemIndex(element);

        // If the user has scrolled to the bottom, query for more news items and add them to the feed.
        if(!$scope.loadingNews && $scope.active.data.length < newsTotalCount && element.find(".item").last().position().top <= element.height()) {
            // Prevent extraneous queries from updateNewsfeedOnScroll.
            $scope.loadingNews = true;
            $scope.active.limit = $scope.active.limit + LIMIT_INTERVAL;
            if(newsEventData.length) {
                updateData(newsEventData.slice($scope.active.limit - LIMIT_INTERVAL, $scope.active.limit));
            } else {
                $scope.loadingNews = true;
                $scope.functions.queryAndUpdate($scope.functions.addToQuery, $scope.functions.executeQuery, function(data) {
                    // Only add the items to the feed that aren't there already.
                    updateData(data.slice($scope.active.limit - LIMIT_INTERVAL, $scope.active.limit));
                    $scope.loadingNews = false;
                });
            }
        }

        if(!$scope.loadingTranslations && $scope.active.showTranslations) {
            // See if the news item before the first translated news item is visible; if so, translate it.
            if(translatedIndexRange[0] > 0) {
                var index = translatedIndexRange[0] + 1;
                var newsItem = element.find(".item:nth-of-type(" + index + ")");
                if(newsItem.position().top >= 0) {
                    runAllTranslations(Math.max(0, translatedIndexRange[0] - TRANSLATION_INTERVAL), translatedIndexRange[0]);
                }
            }

            // See if the news item after the final translated news item is visible; if so, translate it.
            if(translatedIndexRange[1] > 0 && translatedIndexRange[1] < $scope.active.data.length) {
                var index = translatedIndexRange[1] + 1;
                var newsItem = element.find(".item:nth-of-type(" + index + ")");
                if(newsItem.position().top <= element.height()) {
                    runAllTranslations(translatedIndexRange[1], Math.min($scope.active.data.length, translatedIndexRange[1] + TRANSLATION_INTERVAL));
                }
            }
        }
    };

    /**
     * Updates the top news item index based on the position of the news item at the current top index.
     * @param {Object} element
     * @method updateTopNewsItemIndex
     * @private
     */
    var updateTopNewsItemIndex = function(element) {
        var topNewsItemIndex = $scope.topNewsItemIndex + 1;
        var topNewsItem = element.find(".item:nth-of-type(" + topNewsItemIndex + ")");
        var topNewsItemPosition = topNewsItem.position();

        if(topNewsItemPosition && topNewsItemPosition.top > 0) {
            $scope.topNewsItemIndex = Math.max(0, $scope.topNewsItemIndex - 1);
        }
        if(topNewsItemPosition && topNewsItemPosition.top + topNewsItem.outerHeight(true) < 0) {
            $scope.topNewsItemIndex = Math.min($scope.active.data.length, $scope.topNewsItemIndex + 1);
        }
    };

    /**
     * Runs the linky library on the text of news items in the feed.
     * @method runLinky
     * @private
     */
    var runLinky = function() {
        // Use $timeout to ensure that linky is run after angular's digest updates the items in the feed.
        $timeout(function() {
            $scope.functions.getElement(".item .content").linky($scope.functions.getLinkyConfig());
        });
    };

    /**
     * Event handler for news events issued over Neon's messaging channels.
     * @param {Object} message A Neon news message.
     * @method onNews
     * @private
     */
    var onNews = function(message) {
        if(message.news && message.name && message.name === $scope.feedName) {
            // Show all of the news instead of slicing it to avoid odd behavior during news-highlights events.
            $scope.active.data = message.news;
            $scope.active.data.forEach(function(item) {
                if(item.primaryTitle) {
                    item.primaryTitleTranslated = item.primaryTitle;
                }
                if(item.secondaryTitle) {
                    item.secondaryTitleTranslated = item.secondaryTitle;
                }
                if(item.content) {
                    item.contentTranslated = item.content;
                }
            });
            newsTotalCount = message.news.length;
            $scope.active.feedType = (message.type || $scope.active.feedType).toUpperCase();
            newsEventData = message.news;
            $scope.topNewsItemIndex = 0;
            runLinky();

            if(message.news.length) {
                $scope.functions.updateTranslations();
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
                newsHighlights.show.primaryTitles = message.show.primaryTitles || [];
                newsHighlights.show.secondaryTitles = message.show.secondaryTitles || [];
            }
            if(message.highlights) {
                newsHighlights.highlights.primaryTitles = message.highlights.primaryTitles || [];
                newsHighlights.highlights.secondaryTitles = message.highlights.secondaryTitles || [];
            }
        }
    };

    $scope.functions.onUpdateFields = function(datasetService) {
        var primaryTitleFieldName = $scope.bindings.primaryTitleField || "";
        $scope.active.primaryTitleField = _.find($scope.fields, function(field) {
            return field.columnName === primaryTitleFieldName;
        }) || datasetService.createBlankField();
        var secondaryTitleFieldName = $scope.bindings.secondaryTitleField || "";
        $scope.active.secondaryTitleField = _.find($scope.fields, function(field) {
            return field.columnName === secondaryTitleFieldName;
        }) || datasetService.createBlankField();
        var dateFieldName = $scope.bindings.dateField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.DATE) || "";
        $scope.active.dateField = _.find($scope.fields, function(field) {
            return field.columnName === dateFieldName;
        }) || datasetService.createBlankField();
        var contentFieldName = $scope.bindings.contentField || "";
        $scope.active.contentField = _.find($scope.fields, function(field) {
            return field.columnName === contentFieldName;
        }) || datasetService.createBlankField();

        $scope.feedName = $scope.bindings.feedName || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.NEWSFEED_NAME) || "";
        $scope.active.feedType = $scope.bindings.feedType ? $scope.bindings.feedType.toUpperCase() :
            datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.NEWSFEED_TYPE) || DEFAULT_TYPE;

        newsEventData = [];
    };

    $scope.functions.onChangeField = function() {
        deleteData();
    }

    var deleteData = function() {
        $scope.active.data = [];
        $scope.active.limit = LIMIT_INTERVAL;
        $scope.topNewsItemIndex = 0;
        $scope.functions.removeLinks();
        newsEventData = [];
    };

    $scope.functions.hasValidDataFields = function(datasetService) {
        return datasetService.isFieldValid($scope.active.dateField) || datasetService.isFieldValid($scope.active.contentField);
    };

    $scope.functions.addToQuery = function(query, filterService) {
        var fields = [$scope.active.dateField.columnName, $scope.active.contentField.columnName];
        if($scope.functions.isFieldValid($scope.active.primaryTitleField)) {
            fields.push($scope.active.primaryTitleField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.secondaryTitleField)) {
            fields.push($scope.active.secondaryTitleField.columnName);
        }
        query.withFields(fields).sortBy($scope.active.dateField.columnName, $scope.active.sortDirection).limit($scope.active.limit);
        return query;
    };

    $scope.functions.updateData = function(data) {
        deleteData();
        updateData(data);
        $scope.functions.updateTranslations();
        if(data.length) {
            queryForNewsCount();
        }
    };

    /**
     * Updates this visualization to display the given query result data.
     * @param {Array} data The query result data containing {Object} data rows mapping column name to value.
     * @method updateData
     * @private
     */
    var updateData = function(data) {
        data.forEach(function(item) {
            var primary = $scope.functions.isFieldValid($scope.active.primaryTitleField) ? neon.helpers.getNestedValue(item, $scope.active.primaryTitleField.columnName) : "";
            var secondary = $scope.functions.isFieldValid($scope.active.secondaryTitleField) ? neon.helpers.getNestedValue(item, $scope.active.secondaryTitleField.columnName) : "";
            var createdLinks = createExternalLinksForNewsItemData(primary, secondary);

            var content = neon.helpers.getNestedValue(item, $scope.active.contentField.columnName);
            if(_.isArray(content)) {
                content = content.join("\n");
            }

            $scope.active.data.push({
                date: new Date(neon.helpers.getNestedValue(item, $scope.active.dateField.columnName)),
                primaryTitle: primary,
                primaryTitleTranslated: primary,
                secondaryTitle: secondary,
                secondaryTitleTranslated: secondary,
                content: content,
                contentTranslated: content,
                linksPopupButtonJson: createLinksPopupButtonJson(primary, secondary),
                showLinksPopupButton: !createdLinks
            });
        });

        runLinky();
    };

    /**
     * Creates the external links for the given news primary and secondary title properties and returns if any links were created.
     * @param {String} primary
     * @param {String} secondary
     * @method createExternalLinksForNewsItemData
     * @private
     * @return {Boolean}
     */
    var createExternalLinksForNewsItemData = function(primary, secondary) {
        var primaryLinksCount = primary ? $scope.functions.createLinks($scope.active.primaryTitleField, primary).length : 0;
        var secondaryLinksCount = secondary ? $scope.functions.createLinks($scope.active.secondaryTitleField, secondary).length : 0;
        return primaryLinksCount || secondaryLinksCount;
    };

    /**
     * Creates and returns the JSON string for the links popup button using the given news primary and secondary title properties.
     * @param {String} primary
     * @param {String} secondary
     * @method createLinksPopupButtonJson
     * @private
     * @return {String}
     */
    var createLinksPopupButtonJson = function(primary, secondary) {
        var list = [];
        if(primary) {
            list.push({
                source: $scope.visualizationId,
                key: $scope.functions.getLinksPopupService().generateKey($scope.active.primaryTitleField, primary)
            });
        }
        if(secondary) {
            list.push({
                source: $scope.visualizationId,
                key: $scope.functions.getLinksPopupService().generateKey($scope.active.secondaryTitleField, secondary)
            });
        }
        return $scope.functions.getLinksPopupService().createButtonJsonFromList(list);
    };

    $scope.functions.updateTranslations = function() {
        translatedIndexRange = [-1, -1];
        if($scope.active.showTranslations) {
            runAllTranslations($scope.topNewsItemIndex, $scope.topNewsItemIndex + TRANSLATION_INTERVAL);
        }
    };

    /**
     * Translates text within the translation limit with the from/to languages specified.
     * @param {Integer} [sliceStart] Optional field to specify at what index to start translating text at.
     * @param {Integer} [sliceEnd] Optional field to specify at what index to end translating text at (exclusive).
     * @method runAllTranslations
     * @private
     */
    var runAllTranslations = function(sliceStart, sliceEnd) {
        $scope.loadingTranslations = true;
        sliceStart = sliceStart || 0;
        sliceEnd = sliceEnd || sliceStart + TRANSLATION_INTERVAL;

        runTranslation("primaryTitle", sliceStart, sliceEnd, function() {
            runTranslation("secondaryTitle", sliceStart, sliceEnd, function() {
                runTranslation("content", sliceStart, sliceEnd, function() {
                    runLinky();
                    translatedIndexRange[0] = translatedIndexRange[0] < 0 ? sliceStart : Math.min(translatedIndexRange[0], sliceStart);
                    translatedIndexRange[1] = translatedIndexRange[1] < 0 ? sliceEnd : Math.max(translatedIndexRange[1], sliceEnd);
                    $scope.loadingTranslations = false;
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
     * @method runTranslation
     * @private
     */
    var runTranslation = function(newsProperty, sliceStart, sliceEnd, successCallback) {
        var dataText = _.pluck($scope.active.data, newsProperty).map(function(data) {
            return $.isNumeric(data) ? "" : data;
        });

        var translationSuccessCallback = function(translations) {
            var index = sliceStart;
            translations.forEach(function(item) {
                while(!$scope.active.data[index][newsProperty] && index < sliceEnd) {
                    index++;
                }
                if(index < sliceEnd) {
                    var newsItem = $scope.active.data[index];
                    newsItem[newsProperty + "Translated"] = item.translatedText;
                    newsItem.isTranslated = newsItem.isTranslated || newsItem[newsProperty] !== newsItem[newsProperty + "Translated"];
                    index++;
                }
            });
            successCallback();
        };

        var translationFailureCallback = function() {
            for(var i = sliceStart; i < sliceEnd; ++i) {
                $scope.active.data[i][newsProperty + "Translated"] = $scope.active.data[i][newsProperty];
                $scope.active.data[i].isTranslated = false;
            }
            $scope.loadingTranslations = false;
        };

        $scope.functions.runTranslation(dataText.slice(sliceStart, sliceEnd), translationSuccessCallback, translationFailureCallback);
    };

    /**
     * Query for the (non-limited) count of news data to display in this visualization.
     * @method queryForNewsCount
     * @private
     */
    var queryForNewsCount = function() {
        $scope.functions.queryAndUpdate(function(query) {
            query.aggregate(neon.query.COUNT, "*", "count");
            return query;
        }, $scope.functions.executeQuery, function(data) {
            newsTotalCount = data.length ? data[0].count : 0;
        });
    };

    $scope.handleChangePrimaryTitleField = function() {
        $scope.functions.handleChangeField("primaryTitleField", $scope.active.primaryTitleField);
    };

    $scope.handleChangeSecondaryTitleField = function() {
        $scope.functions.handleChangeField("secondaryTitleField", $scope.active.secondaryTitleField);
    };

    $scope.handleChangeDateField = function() {
        $scope.functions.handleChangeField("dateField", $scope.active.dateField);
    };

    $scope.handleChangeContentField = function() {
        $scope.functions.handleChangeField("contentField", $scope.active.contentField);
    };

    /**
     * Triggered by clicking one of the sort-by-date buttons.
     * @method handleChangeSort
     */
    $scope.handleChangeSort = function() {
        if(newsEventData.length) {
            // TODO Logging
            $scope.active.data.reverse();
            translatedIndexRange = [$scope.active.data.length - translatedIndexRange[1], $scope.active.data.length - translatedIndexRange[0]];
        } else {
            $scope.functions.handleChangeField("sortDirection", $scope.active.sortDirection, "button");
        }
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.handleChangeField("limit", $scope.active.limit, "button");
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
        if(newsHighlights.highlights.primaryTitles.length || newsHighlights.highlights.secondaryTitles.length) {
            if(newsHighlights.highlights.primaryTitles.indexOf(item.primaryTitle) >= 0 || newsHighlights.highlights.secondaryTitles.indexOf(item.secondaryTitle) >= 0) {
                style.push("highlight");
            }
        }
        if(newsHighlights.show.primaryTitles.length || newsHighlights.show.secondaryTitles.length) {
            if(newsHighlights.show.primaryTitles.indexOf(item.primaryTitle) < 0 && newsHighlights.show.secondaryTitles.indexOf(item.secondaryTitle) < 0) {
                style.push("hidden");
            }
        }
        return style.join(" ");
    };

    $scope.functions.addToBindings = function(bindings) {
        // TODO
        bindings["bind-primary-title-field"] = ($scope.active.primaryTitleField && $scope.active.primaryTitleField.columnName) ? "'" + $scope.active.primaryTitleField.columnName + "'" : undefined;
        bindings["bind-secondary-title-field"] = ($scope.active.secondaryTitleField && $scope.active.secondaryTitleField.columnName) ? "'" + $scope.active.secondaryTitleField.columnName + "'" : undefined;
        bindings["bind-date-field"] = ($scope.active.dateField && $scope.active.dateField.columnName) ? "'" + $scope.active.dateField.columnName + "'" : undefined;
        bindings["bind-content-field"] = ($scope.active.contentField && $scope.active.contentField.columnName) ? "'" + $scope.active.contentField.columnName + "'" : undefined;
        bindings["bind-feed-name"] = $scope.feedName ? "'" + $scope.feedName + "'" : undefined;
        bindings["bind-feed-type"] = $scope.active.feedType ? "'" + $scope.active.feedType + "'" : undefined;
        return bindings;
    };

    $scope.functions.allowTranslation = function() {
        return true;
    };
}]);
