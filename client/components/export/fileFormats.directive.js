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

/**
 * This Angular JS directive adds a group of buttons to a page that allow the user to select what type of file clicking export
 * buttons on that page will output.
 *
 * @namespace neonDemo.directives
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('fileFormats', ['ExportService', function(exportService) {
    return {
        templateUrl: 'partials/directives/fileFormats.html',
        restrict: 'EA',
        link: function($scope) {
            /**
             * Which one of these is made with "selected: true" should be the same as the declared initial value for
             * format inside of exportService.js.
             * The value field of each format should match up with the static final ints declared in ExportService.groovy,
             * and serves as a psuedo-enum value.
             */
            $scope.formats = [{
                name: 'csv',
                selected: true,
                value: 0
            }, {
                name: 'xlsx',
                selected: false,
                value: 1
            }];

            $scope.selectFormat = function(fileFormat) {
                $scope.formats.forEach(function(format) {
                    format.selected = false;
                });
                fileFormat.selected = true;
                exportService.setFileFormat(fileFormat.value);
            };
        }
    };
}]);
