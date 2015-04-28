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

angular.module("neonDemo.services")
.factory("PopupService",
    function() {
        var service = {};

        service.replaceLinkKeywords = function(links) {
            var finalLinks = [];
            for(var i = 0; i < links.length; ++i) {
                var link = links[i];
                link.target = link.data.query;
                link.url = link.url.replace("SERVER", link.data.server);
                for(var j = 0; j < link.args.length; ++j) {
                    if(link.data.field) {
                        link.args[j].value = link.args[j].value.replace("FIELD", link.data.field);
                    }
                    if(link.data.value) {
                        link.args[j].value = link.args[j].value.replace("VALUE", link.data.value);
                    }
                }
                console.log(link.name + "," + link.image + "," + link.url + "," + link.target + "," + link.args[0].name + ","+ link.args[0].value);
                finalLinks.push(link);
            }
            return finalLinks;
        };

        /**
         * Creates and returns the HTML element for a popup modal dialog with the given title containing the given links.
         * @param {String} The unique name used to create the ID for the HTML element for the popup
         * @param {String} The title of the popup
         * @param {Array} The array of link Objects, each containing:
         * <ul>
         *      <li> {String} image The image for the link </li>
         *      <li> {String} name The display name for the link </li>
         *      <li> {String} url The action url for the form containing the link </li>
         *      <li> {String} target The target text for the form containing the link (optional) </li>
         *      <li> {Array} args An array of hidden inputs for the form containing the link, each an Object mapping a {String} name and {String} value </li>
         * </ul>
         * @method createLinksPopup
         * @return {String} The HTML element for the popup
         */
        service.createLinksPopup = function(uniqueName, title, inputLinks) {
            var links = service.replaceLinkKeywords(inputLinks);

            var uniqueId = 'neon-popup-' + uniqueName;
            var anchorElement = '<a data-toggle="modal" data-target="#' + uniqueId + '" class="collapsed dropdown-toggle primary neon-popup-link"><span class="glyphicon glyphicon-link"></span></a>';

            var listElements = '';
            for(var i = 0; i < links.length; ++i) {
                var link = links[i];
                var thumbnailElement = '<img alt="' + link.name + '" class="img-thumbnail center-block" src="' + link.image + '"><span class="text-uppercase small">' + link.name + '</span>';
                var buttonElement = '<button type="submit" tabindex="0" title="' + link.name + '">' + thumbnailElement + '</button>';

                listElements += '<li><form action="' + link.url + '" method="get" target="' + link.target + '">';
                for(var j = 0; j < link.args.length; ++j) {
                    var arg = link.args[j];
                    listElements += '<input type="hidden" name="' + arg.name + '" value="' + arg.value + '">';
                }
                listElements += buttonElement + '</form></li>';
            }

            var headerElement = '<div class="modal-header"><button class="close" data-dismiss="modal" aria-hidden="true">&times;</button><h4 class="modal-title">' + title + '</h4></div>';
            var bodyElement = '<div class="modal-body"><div><ul>' + listElements + '</ul></div></div>';
            var footerElement = '<div class="modal-footer"><button class="btn btn-default" data-dismiss="modal">Close</button></div>';
            var dialogElement = '<div class="modal-dialog"><div class="modal-content">' + headerElement + bodyElement + footerElement + '</div></div>';
            var linksPopupElement = '<div class="modal fade neon-popup" id="' + uniqueId + '" tabindex="-1" role="dialog" aria-hidden="true">' + dialogElement + '</div>';

            return anchorElement + linksPopupElement;
        };

        return service;
    }
);
