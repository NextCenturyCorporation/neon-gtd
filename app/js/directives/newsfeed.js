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
.directive('newsfeed', function() {
    return {
        templateUrl: 'partials/directives/newsfeed.html',
        restrict: 'EA',
        scope: {},
        link: function($scope, $element) {
            $element.addClass('newsfeed');

            $scope.element = $element;

            $scope.selectedDate = undefined;

            $scope.data = {
                news: [],
                type: undefined,
                highlights: {
                    heads: [],
                    names: []
                }
            };

            var DEFAULT_TYPE = "TWITTER";

            /**
             * Initializes the visualization.
             * @method initialize
             * @private
             */
            var initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe("news", onNews);
                $scope.messenger.subscribe("news_highlights", onNewsHighlights);
                $scope.messenger.subscribe("date_selected", onDateSelected);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });
            };

            /**
             * Event handler for news events issued over Neon's messaging channels.
             * @param {Object} message A Neon news message.
             * @method onNews
             * @private
             */
            var onNews = function(message) {
                if(message.news) {
                    $scope.data.news = message.news;
                    $scope.data.type = (message.type || DEFAULT_TYPE).toUpperCase();
                }
            };

            /**
             * Event handler for news highlights events issued over Neon's messaging channels.
             * @param {Object} message A Neon news highlights message.
             * @method onNewsHighlights
             * @private
             */
            var onNewsHighlights = function(message) {
                if(message.highlights) {
                    $scope.data.highlights.heads = message.highlights.heads || [];
                    $scope.data.highlights.names = message.highlights.names || [];
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
                    if($scope.data.highlights.heads.indexOf(item.head) < 0 && $scope.data.highlights.names.indexOf(item.name) < 0) {
                        style.push("hidden");
                    } else {
                        style.push("highlight");
                    }
                }
                return style.join(" ");
            };

            neon.ready(function() {
                initialize();
            });
        }
    };
});
