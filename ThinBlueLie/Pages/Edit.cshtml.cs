﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.Mvc.Rendering;
using ThinBlue;

namespace ThinBlueLie.Pages
{
    public class EditModel
    {
        [BindProperty]
        public Edit Timelineinfo { get; set; }
        [BindProperty]
        public List<Media> Medias { get; set; }
        [BindProperty]
        public List<Officer> Officers { get; set; }
        [BindProperty]
        public List<Subject> Subjects { get; set; }

        public IList<string> SelectedWeapons { get; set; }
        public IList<SelectListItem> AvailableWeapons { get; set; }

        public IList<string> SelectedMisconducts { get; set; }
        public IList<SelectListItem> AvailableMisconducts { get; set; }

        public EditModel()
        {
            SelectedWeapons = new List<string>();
            AvailableWeapons = new List<SelectListItem>();

            SelectedMisconducts = new List<string>();
            AvailableMisconducts = new List<SelectListItem>();
        }        
    }
}