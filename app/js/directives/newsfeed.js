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

            $scope.data = {
                date: undefined,
                type: undefined,
                news: [],
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
                    $scope.data.date = message.date;
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
                    $scope.$apply(function() {
                        $scope.data.highlights.heads = message.highlights.heads || [];
                        $scope.data.highlights.names = message.highlights.names || [];
                    });
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
                if(item.date > $scope.data.date) {
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
